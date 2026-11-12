package dev.shoplab.orders;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.stereotype.Component;

/**
 * A seam for making the capture race deterministic. When armed for an order, the first worker that has checked
 * "no capture yet" for it stops here, before it captures, until it is released. Unarmed (always, outside the
 * scripted world and the tests), it does nothing.
 */
@Component
public class CaptureGate {

    /** One armed gate. {@code arrived} opens when the first worker reaches it. */
    public static final class Armed {
        private final String orderId;
        private final CountDownLatch arrived = new CountDownLatch(1);
        private final CountDownLatch release = new CountDownLatch(1);
        private final AtomicBoolean taken = new AtomicBoolean();

        private Armed(String orderId) {
            this.orderId = orderId;
        }

        public boolean awaitArrival(long millis) throws InterruptedException {
            return arrived.await(millis, TimeUnit.MILLISECONDS);
        }

        public void release() {
            release.countDown();
        }
    }

    private volatile Armed armed;

    public Armed arm(String orderId) {
        Armed a = new Armed(orderId);
        armed = a;
        return a;
    }

    public void disarm(Armed a) {
        a.release();
        if (armed == a) {
            armed = null;
        }
    }

    /** Called by a worker between its check and its capture. */
    void pass(String orderId) {
        Armed a = armed;
        if (a == null || !a.orderId.equals(orderId) || !a.taken.compareAndSet(false, true)) {
            return;
        }
        a.arrived.countDown();
        try {
            if (!a.release.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("capture gate for #" + orderId + " was never released");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
