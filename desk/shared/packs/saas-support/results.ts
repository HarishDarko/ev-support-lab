// SYNTHETIC. The SaaS lab's canary and control results over 14 days, as the server-side prompts and fallbacks quote
// them. They are the story values the lab's experiment must reproduce (lab-saas/src/main/resources/experiment/
// inputs.json, expectedStory, checked by ExperimentStoryTest). The desk shows the lab's own output instead
// (src/data/experiment.saas-support.json), and tests/saas-incident.test.ts checks the two agree.

export interface Arm {
  events: number;
  tokenRequests: number;
  storms: number;
  pauses: number;
  realOutagePauses: number;
  lost: number;
  deliveredTwice: number;
}

export const RESULTS = {
  windowDays: 14,
  canary: {
    endpoints: 10,
    before: {
      events: 6869,
      tokenRequests: 10573,
      storms: 9,
      pauses: 5,
      realOutagePauses: 0,
      lost: 23,
      deliveredTwice: 0,
    },
    after: { events: 6887, tokenRequests: 3342, storms: 0, pauses: 1, realOutagePauses: 1, lost: 0, deliveredTwice: 0 },
  },
  control: {
    endpoints: 10,
    before: {
      events: 6839,
      tokenRequests: 10474,
      storms: 8,
      pauses: 4,
      realOutagePauses: 0,
      lost: 25,
      deliveredTwice: 0,
    },
    after: {
      events: 6867,
      tokenRequests: 10562,
      storms: 9,
      pauses: 5,
      realOutagePauses: 0,
      lost: 22,
      deliveredTwice: 0,
    },
  },
} satisfies {
  windowDays: number;
  canary: { endpoints: number; before: Arm; after: Arm };
  control: { endpoints: number; before: Arm; after: Arm };
};
