import { createContext, useContext } from "react";

/** The ticket the desk was opened for, if any (for example, a tile selected on the board). */
export const DeskTicket = createContext<string | null>(null);
export const useDeskTicket = () => useContext(DeskTicket);
