// The opening screen: a choice of the industries, each with one line on its own case. Every industry carries equal
// weight: its own queue, its own incident and its own reproduction lab. An old link that names a desk tab but no
// industry lands here too, and opens that tab once an industry is picked.
import type { PackId } from "../../shared/packs";
import { INDUSTRY_OPTIONS } from "./industry";
import "../pages/Page.css";
import "./Chooser.css";

/** Each industry's case, in one line. Every pack in the registry needs one, offered or not. */
export const INDUSTRY_CASES = {
  "ev-charging": "A charging network: sessions stay open after a charger reconnects.",
  "saas-support":
    "A project-management product: webhook endpoints are paused by a token-refresh storm while customers' servers are up.",
  "e-commerce": "A homeware shop: orders are stuck in Payment pending after checkout retries a slow payment.",
} satisfies Record<PackId, string>;

const COUNT: Record<number, string> = { 2: "two", 3: "three", 4: "four", 5: "five" };

export function Chooser({ onPick, deskLink }: { onPick: (id: PackId) => void; deskLink: boolean }) {
  const count = COUNT[INDUSTRY_OPTIONS.length] ?? String(INDUSTRY_OPTIONS.length);
  return (
    <main id="stage" className="story" tabIndex={-1}>
      <article className="page">
        <p className="page-kicker">Support Desk · synthetic data · prototype</p>
        <h1 className="page-title">Pick an industry</h1>
        <p className="page-lede">
          One Eastern-time support shift, in {count} industries. Each has its own queue, its own incident, and its own
          lab that reproduces the bug and tests the fix. Every company, ticket and number is synthetic.
        </p>
        {deskLink && <p className="page-note">This link opens the desk. Pick an industry and it opens there.</p>}
        <ul className="chooser-list">
          {INDUSTRY_OPTIONS.map((o) => (
            <li key={o.id}>
              <button type="button" className="chooser-card" onClick={() => onPick(o.id)}>
                <span className="chooser-name">{o.name}</span>{" "}
                <span className="chooser-case">{INDUSTRY_CASES[o.id]}</span>
              </button>
            </li>
          ))}
        </ul>
      </article>
    </main>
  );
}
