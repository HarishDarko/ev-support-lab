import type { Cell } from "../../incident/types";

/** The table classes for a cell: dk-num, dk-mono, both or none. */
export const cellClass = (c: Cell) => [c.num && "dk-num", c.mono && "dk-mono"].filter(Boolean).join(" ") || undefined;
