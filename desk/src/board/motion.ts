// Motion constants from docs/design/direction.md: 150/250/350 ms, one ease, staggers capped at 1.2 s in total.
export const EASE = [0.2, 0.8, 0.2, 1] as const;
export const DUR = { fast: 0.15, base: 0.25, slow: 0.35 } as const;

const STEP = 0.025;
const CAP = 1.2 - DUR.slow;

/** Delay for the i-th item of a staggered group, in seconds. */
export const stagger = (i: number, step = STEP) => Math.min(i * step, CAP);

export const enter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: DUR.base, ease: EASE },
} as const;
