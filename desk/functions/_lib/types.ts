// Types shared by the Pages Functions. They are written by hand (not taken from @cloudflare/workers-types)
// so the same files also type-check in the Node-based unit tests.

/** The slice of a Workers KV namespace the rate limiter uses. */
export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** Bindings and variables for the desk. Everything is optional: a missing value is a handled case. */
export interface Env {
  ANTHROPIC_API_KEY?: string;
  /** "1" turns the live model off: every step answers from the deterministic rules. Used by e2e and CI. */
  MOCK?: string;
  /** Model ids. Defaults are in ai.ts. */
  FAST_MODEL?: string;
  DEEP_MODEL?: string;
  RL_PER_IP_HOUR?: string;
  RL_GLOBAL_DAY?: string;
  DESK_KV?: KVLike;
}

/** What a step receives from the request body. It is client-supplied, so every field is untrusted. */
export type StepInput =
  | {
      ids?: unknown;
      triage?: unknown;
      investigation?: unknown;
      handoff?: unknown;
      summary?: unknown;
      text?: unknown;
      article?: unknown;
    }
  | null
  | undefined;

/** One entry in a trace's list of checks. */
export interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

export type JsonSchema = Record<string, unknown>;

export interface Usage {
  input: number;
  output: number;
}
