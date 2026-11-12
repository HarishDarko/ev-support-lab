// EV charging pack: what the browser needs to list and label the pack, without its prompts or rules.
export const META = {
  id: "ev-charging",
  name: "EV charging",
  complete: true,
  hasIncident: true,
  fields: [
    { key: "site", label: "Site" },
    { key: "charger", label: "Charger" },
    { key: "fw", label: "Firmware" },
  ],
} as const;
