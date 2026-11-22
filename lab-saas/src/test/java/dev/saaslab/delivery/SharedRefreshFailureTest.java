package dev.saaslab.delivery;

import static org.assertj.core.api.Assertions.assertThat;

import dev.saaslab.LabProperties;
import dev.saaslab.clock.MutableClock;
import dev.saaslab.delivery.DeliveryStore.Endpoint;
import dev.saaslab.delivery.TokenClient.Answer;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

/**
 * The shared refresh when the identity provider does not give a token, with real threads and no database: the
 * callers that waited for a failed refresh share its answer, and a 429 keeps everyone away until Retry-After.
 */
class SharedRefreshFailureTest {

    private static final int THREADS = 32;
    private static final Instant EPOCH = Instant.parse("2026-03-02T05:00:00Z");
    private static final Endpoint ENDPOINT = new Endpoint("ep-fail", "ws-fail", "http://127.0.0.1:9/unused", "oauth",
            "client-fail", "http://127.0.0.1:9/oauth/token");

    private final MutableClock clock = new MutableClock(EPOCH);
    private final List<Thread> workers = new CopyOnWriteArrayList<>();

    @Test
    void callersThatWaitedForAFailedRefreshShareItsAnswerInsteadOfAskingAgain() throws Exception {
        AtomicInteger asked = new AtomicInteger();
        // The first request is answered only once every other thread is blocked on the endpoint's refresh lock,
        // so all of them have arrived while it was in flight.
        TokenClient idp = scripted(() -> {
            if (asked.incrementAndGet() == 1) {
                awaitOthersBlocked();
            }
            return new Answer(0, null, 0, "unreachable");
        });
        TokenCache cache = new TokenCache(idp, clock);

        List<Answer> answers = together(() -> cache.refreshShared(ENDPOINT, null));

        assertThat(asked).hasValue(1);
        assertThat(answers).hasSize(THREADS).allSatisfy(a -> {
            assertThat(a.ok()).isFalse();
            assertThat(a.status()).isZero();
        });

        // A caller that comes later did not wait for that refresh, so it asks again.
        cache.refreshShared(ENDPOINT, null);
        assertThat(asked).hasValue(2);
    }

    @Test
    void afterA429NobodyAsksAgainUntilRetryAfterHasPassed() {
        AtomicInteger asked = new AtomicInteger();
        TokenCache cache = new TokenCache(scripted(() -> {
            asked.incrementAndGet();
            return new Answer(429, null, 30, "rate_limited");
        }), clock);

        assertThat(cache.refreshShared(ENDPOINT, null).status()).isEqualTo(429);
        clock.advance(Duration.ofSeconds(10));
        Answer later = cache.refreshShared(ENDPOINT, null);
        assertThat(asked).as("not asked again before Retry-After").hasValue(1);
        assertThat(later.status()).isEqualTo(429);
        assertThat(later.retryAfterSeconds()).isEqualTo(20);

        clock.advance(Duration.ofSeconds(20));
        cache.refreshShared(ENDPOINT, null);
        assertThat(asked).as("asked again once Retry-After has passed").hasValue(2);
    }

    @Test
    void aCallerThatWaitedPastRetryAfterAsksAgainInsteadOfGettingAnOld429() throws Exception {
        AtomicInteger asked = new AtomicInteger();
        CountDownLatch inFlight = new CountDownLatch(1);
        AtomicReference<Thread> late = new AtomicReference<>();
        // The waiting caller's clock reads 5 s after the first caller's, so it gets the lock after Retry-After (1 s).
        Clock perThread = new Clock() {
            @Override
            public ZoneId getZone() {
                return ZoneOffset.UTC;
            }

            @Override
            public Clock withZone(ZoneId zone) {
                return this;
            }

            @Override
            public Instant instant() {
                return Thread.currentThread() == late.get() ? EPOCH.plusSeconds(5) : EPOCH;
            }
        };
        TokenCache cache = new TokenCache(scripted(() -> {
            if (asked.incrementAndGet() == 1) {
                inFlight.countDown();
                awaitBlocked(late);
                return new Answer(429, null, 1, "rate_limited");
            }
            return new Answer(200, new TokenClient.Token("tok-2", EPOCH.plusSeconds(3600)), 0, null);
        }), perThread);

        try (ExecutorService first = Executors.newSingleThreadExecutor()) {
            Future<Answer> refused = first.submit(() -> cache.refreshShared(ENDPOINT, null));
            inFlight.await();
            Answer[] waited = new Answer[1];
            Thread waiter = new Thread(() -> waited[0] = cache.refreshShared(ENDPOINT, null));
            late.set(waiter);
            waiter.start();
            assertThat(refused.get().status()).isEqualTo(429);
            waiter.join(Duration.ofSeconds(20));
            assertThat(asked).as("the late caller asked again").hasValue(2);
            assertThat(waited[0].ok()).isTrue();
        }
    }

    @Test
    void aTokenStoredSinceAFailureMakesThatFailureStale() {
        AtomicInteger asked = new AtomicInteger();
        TokenCache cache = new TokenCache(scripted(() -> asked.incrementAndGet() == 1
                ? new Answer(429, null, 30, "rate_limited")
                : new Answer(200, new TokenClient.Token("tok-" + asked.get(), clock.instant().plusSeconds(3600)), 0,
                        null)), clock);

        assertThat(cache.refreshShared(ENDPOINT, null).status()).isEqualTo(429);
        Answer own = cache.refreshOwn(ENDPOINT);
        assertThat(own.ok()).isTrue();

        // Refused with the token the legacy path stored after the 429, the caller refreshes again.
        Answer again = cache.refreshShared(ENDPOINT, own.token());
        assertThat(again.ok()).isTrue();
        assertThat(asked).hasValue(3);
    }

    @Test
    void aSuccessfulRefreshForgetsTheFailure() {
        AtomicInteger asked = new AtomicInteger();
        TokenCache cache = new TokenCache(scripted(() -> asked.incrementAndGet() == 1
                ? new Answer(503, null, 0, null)
                : new Answer(200, new TokenClient.Token("tok-" + asked.get(), clock.instant().plusSeconds(3600)), 0,
                        null)), clock);

        assertThat(cache.refreshShared(ENDPOINT, null).ok()).isFalse();
        Answer ok = cache.refreshShared(ENDPOINT, null);
        assertThat(ok.ok()).isTrue();
        assertThat(cache.get(ENDPOINT.id())).isEqualTo(ok.token());
    }

    private TokenClient scripted(Supplier<Answer> answer) {
        LabProperties properties = new LabProperties(new LabProperties.Fix(true),
                new LabProperties.Delivery(5, Duration.ofMinutes(5)), new LabProperties.Pause(15, Duration.ofMinutes(60)),
                new LabProperties.Http(Duration.ofSeconds(10)));
        return new TokenClient(null, null, clock, properties) {
            @Override
            public Answer request(Endpoint endpoint) {
                return answer.get();
            }
        };
    }

    /** Waits until the one thread in {@code holder} exists and is blocked on a monitor (the refresh lock). */
    private static void awaitBlocked(AtomicReference<Thread> holder) {
        long deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos();
        while (holder.get() == null || holder.get().getState() != Thread.State.BLOCKED) {
            if (System.nanoTime() > deadline) {
                throw new IllegalStateException("the late caller never reached the refresh lock");
            }
            Thread.onSpinWait();
        }
    }

    /** Waits until every worker thread but the caller is blocked on a monitor (the refresh lock). */
    private void awaitOthersBlocked() {
        long deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos();
        while (workers.stream().filter(t -> t.getState() == Thread.State.BLOCKED).count() < THREADS - 1) {
            if (System.nanoTime() > deadline) {
                throw new IllegalStateException("the other threads never reached the refresh lock");
            }
            Thread.onSpinWait();
        }
    }

    private List<Answer> together(Supplier<Answer> call) throws Exception {
        CountDownLatch ready = new CountDownLatch(THREADS);
        CountDownLatch go = new CountDownLatch(1);
        try (ExecutorService pool = Executors.newFixedThreadPool(THREADS, r -> {
            Thread t = new Thread(r);
            workers.add(t);
            return t;
        })) {
            List<Future<Answer>> futures = new ArrayList<>();
            for (int i = 0; i < THREADS; i++) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await();
                    return call.get();
                }));
            }
            ready.await();
            go.countDown();
            List<Answer> answers = new ArrayList<>();
            for (Future<Answer> f : futures) {
                answers.add(f.get());
            }
            return answers;
        }
    }
}
