import type { ReactNode } from "react";
import "./ui.css";

export type PillTone = "neutral" | "ai" | "attn" | "ok" | "bad";

/** A small label. The tone carries meaning: ai = produced by the AI, attn = held or not confirmed, ok, bad. */
export function Pill({ tone = "neutral", children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={`dk-pill${tone === "neutral" ? "" : ` dk-pill--${tone}`}`}>{children}</span>;
}
