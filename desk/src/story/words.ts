/** "a", "a and b", "a, b and c". */
export const list = (items: readonly string[]) =>
  items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
