import { HERO } from "../../data/synthetic";
import type { HandoffModel } from "../../run/types";

const bullets = (items: readonly string[]) => items.map((s) => `- ${s}`).join("\n");

/** The packet as Markdown, with the logs and tables attached, for pasting into a ticket. Synthetic data. */
export function packetMarkdown(h: HandoffModel): string {
  const logs = HERO.logs
    .map((l) => `### ${l.title}\n\`\`\`\n${l.lines.map((x) => x.join("  ")).join("\n")}\n\`\`\``)
    .join("\n\n");
  const fleet = HERO.fleet
    .map((f) => `| ${f.fw} | ${f.sessions} | ${f.dropsNearUnplug} | ${f.stuck} | ${f.dropsElsewhere} |`)
    .join("\n");
  return [
    `# ${h.title}`,
    `**Severity:** ${h.severity}  \n**Scope:** ${h.scope}`,
    `## The ask\n${h.the_ask}`,
    `## Reproduce\n${h.reproduction.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    `## Evidence attached\n${bullets(h.evidence_attached)}`,
    `## Ruled out\n${bullets(h.ruled_out)}`,
    `## Workaround in place\n${h.workaround_in_place}`,
    `_${h.hypothesis_note}_`,
    `## Attached: log excerpts (synthetic OCPP 2.0.1, gateway summaries)\n${logs}`,
    `## Attached: fleet view, last ${-HERO.firstSeenDay} days\n| Firmware | Sessions | Drops within 90 s of unplug | Ended stuck | Other drops |\n|---|---|---|---|---|\n${fleet}`,
    `## Attached: unplug-to-drop seconds per stuck session\n${HERO.unplugToDropSec.map((g) => `${g.id} ${g.fw} ${g.s}s`).join(", ")}`,
    `## Linked tickets\n${[...HERO.openIds, ...HERO.historyIds].join(", ")}`,
    "(Synthetic data, prototype)",
  ].join("\n\n");
}
