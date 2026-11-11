package dev.shoplab.simulator;

import dev.shoplab.checkout.CheckoutService;
import dev.shoplab.checkout.CheckoutService.Outcome;
import dev.shoplab.checkout.CheckoutService.PayResult;
import dev.shoplab.checkout.CheckoutService.TimeoutView;
import dev.shoplab.clock.MutableClock;
import dev.shoplab.orders.CaptureGate;
import dev.shoplab.orders.OrderService;
import dev.shoplab.shop.OrderTrace;
import dev.shoplab.simulator.FakeProcessor.Plan;
import dev.shoplab.simulator.FakeProcessor.Webhook;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * The scripted shoppers and the scripted processor around the real checkout and order service, on one scripted
 * clock. Events run in time order; everything the service does is real (HTTP to the processor, webhooks over HTTP,
 * PostgreSQL).
 *
 * <p>The shoppers:
 * <ul>
 *   <li>web: on "Something went wrong" (or "still processing") the shopper either pays again after a scripted
 *       number of seconds, or waits;</li>
 *   <li>app (iOS, Android): the app retries by itself, once, 0.5 s after a timeout;</li>
 *   <li>after "Card declined", a scripted shopper enters a different card.</li>
 * </ul>
 */
public final class ScriptedWorld {

    /** The app retries this long after a timeout. */
    public static final Duration APP_RETRY = Duration.ofMillis(500);
    /** Two webhooks for one order closer together than one capture takes are handled by two workers at once. */
    public static final Duration CAPTURE_TAKES = Duration.ofMillis(50);

    /**
     * One shopper's checkout.
     *
     * @param answerMillis the processor's delay for the 1st, 2nd, ... new authorization of this order
     * @param repayAfterMillis web only: pays again this long after a timeout; null waits
     * @param declinedCard if set, the shopper first pays with this card, which declines
     * @param newCardAfterMillis after a decline, the shopper enters a new card this long after seeing it
     * @param title if set, the order's log is captured under this title
     */
    public record Shopper(String checkoutId, String storeId, String orderId, String channel, int amountPence,
            Instant at, List<Long> answerMillis, Long repayAfterMillis, String declinedCard, long newCardAfterMillis,
            boolean dropWebhooks, String title) {
        boolean app() {
            return !"web".equals(channel);
        }

        String goodCard() {
            return "card-" + orderId;
        }
    }

    /** What one checkout did, as the shopper saw it. */
    public record Seen(List<Outcome> answers, List<TimeoutView> timeouts) {}

    private sealed interface Event permits Start, Pay, Timeout, Hook, Sweep {
        Instant at();
    }

    private record Start(Instant at, Shopper s) implements Event {}

    private record Pay(Instant at, Shopper s, String card) implements Event {}

    private record Timeout(Instant at, Shopper s, PayResult attempt) implements Event {}

    private record Hook(Instant at, Webhook w) implements Event {}

    private record Sweep(Instant at, String orderId) implements Event {}

    private record Queued(Event e, long seq) {}

    private final CheckoutService checkout;
    private final OrderService orders;
    private final FakeProcessor processor;
    private final RaceDispatcher races;
    private final OrderTrace trace;
    private final MutableClock clock;
    private final Duration webhookWait;
    private final PriorityQueue<Queued> queue = new PriorityQueue<>((a, b) -> {
        int c = a.e().at().compareTo(b.e().at());
        return c != 0 ? c : Long.compare(a.seq(), b.seq());
    });
    private final Map<String, List<Queued>> pendingHooks = new HashMap<>();
    private final Map<String, Seen> seen = new HashMap<>();
    private final Map<String, Integer> pays = new HashMap<>();
    private final Map<String, Boolean> repaid = new HashMap<>();
    private final List<RaceDispatcher.Race> raceLog = new ArrayList<>();
    private long seq;

    public ScriptedWorld(CheckoutService checkout, OrderService orders, FakeProcessor processor, CaptureGate gate,
            JdbcClient jdbc, OrderTrace trace, MutableClock clock, Duration webhookWait) {
        this.checkout = checkout;
        this.orders = orders;
        this.processor = processor;
        this.races = new RaceDispatcher(processor, gate, jdbc, clock);
        this.trace = trace;
        this.clock = clock;
        this.webhookWait = webhookWait;
    }

    public void add(Shopper s) {
        processor.plan(s.orderId(), new Plan(s.answerMillis(), s.dropWebhooks()));
        if (s.declinedCard() != null) {
            processor.declines(s.declinedCard());
        }
        push(new Start(s.at(), s));
    }

    /** Runs every event due before {@code until}, in time order. */
    public void runUntil(Instant until) {
        while (!queue.isEmpty() && queue.peek().e().at().isBefore(until)) {
            Queued q = queue.poll();
            if (q.e() instanceof Hook h) {
                pendingHooks.get(h.w().orderId()).remove(q);
            }
            // A race moves the clock to its second webhook (at most CAPTURE_TAKES ahead); never go back.
            if (q.e().at().isAfter(clock.instant())) {
                clock.set(q.e().at());
            }
            handle(q.e());
            processor.takeScheduled().forEach(w -> push(new Hook(w.at(), w)));
        }
    }

    public void runAll() {
        runUntil(Instant.MAX);
    }

    public Seen seen(String orderId) {
        return seen.get(orderId);
    }

    public List<RaceDispatcher.Race> races() {
        return raceLog;
    }

    private void handle(Event e) {
        switch (e) {
            case Start st -> {
                Shopper s = st.s();
                seen.put(s.orderId(), new Seen(new ArrayList<>(), new ArrayList<>()));
                if (s.title() != null) {
                    trace.capture(s.orderId());
                }
                checkout.start(s.checkoutId(), s.storeId(), s.orderId(), s.channel(), s.amountPence());
                handle(new Pay(st.at(), s, s.declinedCard() != null ? s.declinedCard() : s.goodCard()));
            }
            case Pay p -> pay(p);
            case Timeout t -> timeout(t);
            case Hook h -> webhook(h);
            case Sweep sw -> orders.holdIfNoWebhook(sw.orderId());
        }
    }

    private void pay(Pay p) {
        Shopper s = p.s();
        pays.merge(s.orderId(), 1, Integer::sum);
        PayResult r = checkout.pay(s.checkoutId(), p.card());
        Seen view = seen.get(s.orderId());
        view.answers().add(r.outcome());
        switch (r.outcome()) {
            case TIMED_OUT -> push(new Timeout(r.seenAt(), s, r));
            case AUTHORIZED -> push(new Sweep(r.seenAt().plus(webhookWait), s.orderId()));
            case DECLINED -> {
                if (p.card().equals(s.declinedCard())) {
                    Instant next = r.seenAt().plus(Duration.ofMillis(s.newCardAfterMillis()));
                    push(new Pay(next, s, s.goodCard()));
                }
            }
        }
    }

    private void timeout(Timeout t) {
        Shopper s = t.s();
        TimeoutView view = checkout.onTimeout(t.attempt().attemptId());
        seen.get(s.orderId()).timeouts().add(view);
        if (view == TimeoutView.CONFIRMED || view == TimeoutView.DECLINED) {
            if (view == TimeoutView.CONFIRMED) {
                push(new Sweep(clock.instant().plus(webhookWait), s.orderId()));
            }
            return;
        }
        String card = s.goodCard();
        if (s.app()) {
            if (pays.get(s.orderId()) < 2) {
                trace.line(s.orderId(), "app", "automatic retry, " + APP_RETRY.toMillis() + " ms after the timeout");
                push(new Pay(clock.instant().plus(APP_RETRY), s, card));
            }
        } else if (s.repayAfterMillis() != null && !repaid.getOrDefault(s.orderId(), false)) {
            repaid.put(s.orderId(), true);
            Instant at = clock.instant().plus(Duration.ofMillis(s.repayAfterMillis()));
            trace.lineAt(s.orderId(), at, "shopper", "taps Pay again");
            push(new Pay(at, s, card));
        }
    }

    private void webhook(Hook h) {
        Webhook w = h.w();
        List<Queued> others = pendingHooks.get(w.orderId());
        Queued partner = others.stream()
                .filter(q -> !((Hook) q.e()).w().at().isAfter(w.at().plus(CAPTURE_TAKES)))
                .findFirst().orElse(null);
        if (partner == null) {
            processorLine(w);
            processor.deliver(w);
            return;
        }
        queue.remove(partner);
        others.remove(partner);
        Webhook second = ((Hook) partner.e()).w();
        processorLine(w);
        trace.lineAt(w.orderId(), second.at(), "processor", processorDetail(second));
        raceLog.add(races.deliverTogether(w, second));
    }

    private void processorLine(Webhook w) {
        trace.line(w.orderId(), "processor", processorDetail(w));
    }

    private static String processorDetail(Webhook w) {
        return "authorization.succeeded  " + w.authorizationId() + "  idem_key=" + w.idempotencyKey()
                + "  (answered in " + OrderTrace.seconds(w.answeredInMillis()) + ")";
    }

    private void push(Event e) {
        Queued q = new Queued(e, seq++);
        queue.add(q);
        if (e instanceof Hook h) {
            pendingHooks.computeIfAbsent(h.w().orderId(), k -> new ArrayList<>()).add(q);
        }
    }
}
