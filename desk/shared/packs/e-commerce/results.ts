// SYNTHETIC. The e-commerce lab's canary and control results over 14 days, as the server-side prompts and fallbacks
// quote them. They are the story values the lab's experiment must reproduce (lab-ecommerce/src/main/resources/
// experiment/inputs.json, expectedStory, checked by ExperimentStoryTest). The desk shows the lab's own output
// instead (src/data/experiment.e-commerce.json), and tests/ecommerce-incident.test.ts checks the two agree.

export interface Arm {
  checkouts: number;
  /** Checkouts whose first answer from the processor came after the 8 s timeout. */
  slowFirstAnswer: number;
  retriedWithNewKey: number;
  secondAuthorization: number;
  /** Held in Payment pending because of the second authorization. */
  stuck: number;
  bothCaptured: number;
  doubleChargedPence: number;
  /** Held for another reason (the webhook that never came). */
  heldOther: number;
  confirmed: number;
  newCardAfterDecline: number;
  /** Checkout looked the payment up by its key after a timeout. */
  lookups: number;
  detectorHits: number;
}

export const RESULTS = {
  windowDays: 14,
  canary: {
    stores: 1,
    before: {
      checkouts: 1644,
      slowFirstAnswer: 3,
      retriedWithNewKey: 1,
      secondAuthorization: 1,
      stuck: 1,
      bothCaptured: 0,
      doubleChargedPence: 0,
      heldOther: 0,
      confirmed: 1643,
      newCardAfterDecline: 3,
      lookups: 0,
      detectorHits: 1,
    },
    after: {
      checkouts: 1646,
      slowFirstAnswer: 4,
      retriedWithNewKey: 0,
      secondAuthorization: 0,
      stuck: 0,
      bothCaptured: 0,
      doubleChargedPence: 0,
      heldOther: 0,
      confirmed: 1646,
      newCardAfterDecline: 4,
      lookups: 4,
      detectorHits: 0,
    },
  },
  control: {
    stores: 4,
    before: {
      checkouts: 6643,
      slowFirstAnswer: 14,
      retriedWithNewKey: 6,
      secondAuthorization: 6,
      stuck: 5,
      bothCaptured: 1,
      doubleChargedPence: 3650,
      heldOther: 1,
      confirmed: 6636,
      newCardAfterDecline: 6,
      lookups: 0,
      detectorHits: 6,
    },
    after: {
      checkouts: 6643,
      slowFirstAnswer: 15,
      retriedWithNewKey: 7,
      secondAuthorization: 7,
      stuck: 6,
      bothCaptured: 1,
      doubleChargedPence: 3650,
      heldOther: 0,
      confirmed: 6636,
      newCardAfterDecline: 6,
      lookups: 0,
      detectorHits: 7,
    },
  },
} satisfies {
  windowDays: number;
  canary: { stores: number; before: Arm; after: Arm };
  control: { stores: number; before: Arm; after: Arm };
};
