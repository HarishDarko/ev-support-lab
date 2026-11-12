// SaaS support pack: what the browser needs to list and label the pack, without its prompts or rules.
export const META = {
  id: "saas-support",
  name: "SaaS support",
  complete: true,
  hasIncident: true,
  fields: [
    { key: "account", label: "Account" },
    { key: "plan", label: "Plan" },
  ],
} as const;
