// E-commerce pack: what the browser needs to list and label the pack, without its prompts or rules.
export const META = {
  id: "e-commerce",
  name: "E-commerce",
  complete: true,
  hasIncident: false,
  fields: [
    { key: "order", label: "Order" },
    { key: "channel", label: "Channel" },
  ],
} as const;
