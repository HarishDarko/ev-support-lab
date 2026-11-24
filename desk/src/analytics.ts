// Anonymous product analytics (PostHog), off until a project key is built in.
//
// With no VITE_POSTHOG_KEY, with a Do Not Track browser, in dev and in tests, nothing here loads and track() does
// nothing. With a key, posthog-js is fetched on demand (its own chunk), so a build without a key ships no PostHog code
// on the page at all. It runs cookieless: persistence "memory" writes no cookie and no localStorage, so every page
// load is a new anonymous visitor.
//
// track() carries only the properties listed in EVENTS, and only values from the listed sets. Ticket text, emails,
// tokens and addresses have no slot, and anything else a caller passes is dropped before it leaves the page.
// This file needs no DOM or Vite types, so the unit tests (plain Node) can load it; main.tsx passes in import.meta.env.

type Choice = readonly string[];

const PACKS = ["ev-charging", "saas-support", "e-commerce"] as const;

export const EVENTS = {
  industry_opened: { pack: PACKS },
  stage_viewed: { stage: ["queue", "triage", "evidence", "verification", "close"] },
  desk_opened: { tab: ["queue", "incident", "handoff", "kb", "coverage", "scorecard"] },
  ticket_inspected: {},
  run_live_requested: { pack: PACKS },
  fix_approved: {},
  reply_sent: {},
  page_viewed: { page: ["operating", "notes"] },
} as const satisfies Record<string, Record<string, Choice>>;

export type EventName = keyof typeof EVENTS;
type ValueOf<S> = S extends readonly (infer V)[] ? V : never;
export type EventProps<E extends EventName> = { [K in keyof (typeof EVENTS)[E]]?: ValueOf<(typeof EVENTS)[E][K]> };

/** The two PostHog regions the page may talk to. The CSP names the same hosts, so any other host would be blocked. */
export const POSTHOG_HOSTS = ["https://us.i.posthog.com", "https://eu.i.posthog.com"] as const;

/** Keeps only the properties an event allows, with values from the allowed list. Everything else is dropped. */
export function cleanProps(event: string, props: Record<string, unknown> | undefined): Record<string, string> {
  const schema = (EVENTS as Record<string, Record<string, Choice> | undefined>)[event];
  const clean: Record<string, string> = {};
  if (!schema || !props) return clean;
  for (const [key, allowed] of Object.entries(schema)) {
    const value = props[key];
    if (typeof value === "string" && allowed.includes(value)) clean[key] = value;
  }
  return clean;
}

interface Client {
  init: (key: string, config: Record<string, unknown>) => unknown;
  capture: (event: string, props?: Record<string, unknown>) => unknown;
  register: (props: Record<string, unknown>) => unknown;
}
export interface Env {
  PROD?: boolean;
  VITE_POSTHOG_KEY?: string;
  VITE_POSTHOG_HOST?: string;
}
export interface Page {
  location: { search: string };
  navigator: { doNotTrack?: string | null; msDoNotTrack?: string | null };
  doNotTrack?: string | null;
}
export interface InitOptions {
  env?: Env;
  page?: Page;
  load?: () => Promise<Client>;
}

let client: Client | null = null;
let starting = false;
let waiting: [string, Record<string, string>][] = [];

// The cast keeps the unit-test project (no DOM types) compiling; the app project, which has them, sees it as redundant.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
const loadPostHog = async (): Promise<Client> => (await import("posthog-js")).default as unknown as Client;

function doNotTrack(page: Page): boolean {
  return [page.navigator.doNotTrack, page.doNotTrack, page.navigator.msDoNotTrack].some(
    (value) => value === "1" || value === "yes",
  );
}

/** Starts PostHog when a key is built in. Returns true once it is running, false when analytics stay off. */
export async function initAnalytics(options: InitOptions = {}): Promise<boolean> {
  const env = options.env ?? {};
  const key = env.VITE_POSTHOG_KEY?.trim();
  if (!key || !env.PROD || client || starting) return client !== null;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const page = options.page ?? (globalThis as unknown as Page);
  if (doNotTrack(page)) return false;
  const host = (env.VITE_POSTHOG_HOST?.trim() || POSTHOG_HOSTS[0]).replace(/\/+$/, "");
  if (!(POSTHOG_HOSTS as readonly string[]).includes(host)) return false;
  starting = true;
  try {
    const posthog = await (options.load ?? loadPostHog)();
    const internal = new URLSearchParams(page.location.search).get("internal") === "1";
    posthog.init(key, {
      api_host: host,
      persistence: "memory",
      autocapture: true,
      capture_pageview: "history_change",
      respect_dnt: true,
      person_profiles: "identified_only",
      // Autocapture records what was clicked, so text on screen is masked out of it.
      mask_all_text: true,
      mask_all_element_attributes: true,
      disable_session_recording: false,
      session_recording: { maskAllInputs: true },
      disable_surveys: true,
    });
    if (internal) posthog.register({ internal: true });
    client = posthog;
    for (const [event, props] of waiting) posthog.capture(event, props);
    return true;
  } catch {
    return false;
  } finally {
    starting = false;
    waiting = [];
  }
}

/** Sends one product event. Does nothing unless analytics are running (or about to). */
export function track<E extends EventName>(event: E, props?: EventProps<E>): void {
  const clean = cleanProps(event, props);
  if (client) client.capture(event, clean);
  else if (starting && waiting.length < 20) waiting.push([event, clean]);
}

/** For tests: forget a running client. */
export function resetAnalytics(): void {
  client = null;
  starting = false;
  waiting = [];
}
