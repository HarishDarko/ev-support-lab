import { EV_INCIDENT } from "../../incident/ev-charging";
import type { Incident } from "../../incident/types";
import type { HandoffModel } from "../../run/types";

const bullets = (items: readonly string[]) => items.map((s) => `- ${s}`).join("\n");

/** The packet as Markdown, with the incident's logs and tables attached, for pasting into a ticket. Synthetic data. */
export function packetMarkdown(h: HandoffModel, incident: Incident = EV_INCIDENT): string {
  return [
    `# ${h.title}`,
    `**Severity:** ${h.severity}  \n**Scope:** ${h.scope}`,
    `## The ask\n${h.the_ask}`,
    `## Reproduce\n${h.reproduction.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    `## Evidence attached\n${bullets(h.evidence_attached)}`,
    `## Ruled out\n${bullets(h.ruled_out)}`,
    `## Workaround in place\n${h.workaround_in_place}`,
    `_${h.hypothesis_note}_`,
    ...incident.handoff.markdown,
    `## Linked tickets\n${[...incident.openIds, ...incident.historyIds].join(", ")}`,
    "(Synthetic data, prototype)",
  ].join("\n\n");
}
