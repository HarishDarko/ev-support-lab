package dev.saaslab.delivery;

import static org.assertj.core.api.Assertions.assertThat;

import dev.saaslab.delivery.DeliveryStore.Endpoint;
import dev.saaslab.delivery.TokenClient.Answer;
import dev.saaslab.delivery.TokenClient.Token;
import dev.saaslab.simulator.FakeIdentityProvider;
import dev.saaslab.support.AbstractLabIT;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

/**
 * The refresh itself, with real threads: 32 threads meet the same expired token at once (released together by a
 * latch). The legacy refresh asks the identity provider 32 times; the shared refresh asks once and every thread
 * gets that token.
 */
class SingleFlightRefreshIT extends AbstractLabIT {

    private static final int THREADS = 32;

    @Test
    void legacyRefreshAsksOncePerThread() throws Exception {
        try (FakeIdentityProvider idp = new FakeIdentityProvider(clock, 3600, 1000)) {
            Endpoint ep = endpoint(idp);
            List<Answer> answers = together(t -> tokens.refreshOwn(ep));
            assertThat(idp.requests()).isEqualTo(THREADS);
            assertThat(answers).allMatch(Answer::ok);
        }
    }

    @Test
    void sharedRefreshAsksOnceAndEveryThreadUsesThatToken() throws Exception {
        try (FakeIdentityProvider idp = new FakeIdentityProvider(clock, 3600, 1000)) {
            Endpoint ep = endpoint(idp);
            Token expired = tokens.refreshOwn(ep).token();
            clock.advance(java.time.Duration.ofHours(1));
            int before = idp.requests();
            List<Answer> answers = together(t -> tokens.refreshShared(ep, expired));
            assertThat(idp.requests() - before).isEqualTo(1);
            assertThat(answers).extracting(a -> a.token().value()).containsOnly(tokens.get(ep.id()).value());
        }
    }

    private Endpoint endpoint(FakeIdentityProvider idp) {
        store.addWorkspace("ws-sf", "Single flight", null);
        Endpoint ep = new Endpoint("ep-sf", "ws-sf", "http://127.0.0.1:9/unused", "oauth", "client-sf", idp.tokenUrl());
        store.addEndpoint(ep);
        return ep;
    }

    private static List<Answer> together(Function<Integer, Answer> call) throws Exception {
        CountDownLatch ready = new CountDownLatch(THREADS);
        CountDownLatch go = new CountDownLatch(1);
        try (ExecutorService pool = Executors.newFixedThreadPool(THREADS)) {
            List<Future<Answer>> futures = new ArrayList<>();
            for (int i = 0; i < THREADS; i++) {
                int n = i;
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await();
                    return call.apply(n);
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
