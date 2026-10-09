import { createContext, useContext } from "react";

/**
 * The meter gate as the desk sees it: which tickets a person has confirmed, and how to confirm one.
 * The story owns the state (useStory); the desk's inspector shows the checkbox.
 */
export interface MeterGate {
  checked: ReadonlySet<string>;
  confirm: (id: string, checked: boolean) => void;
}

export const MeterGateContext = createContext<MeterGate | null>(null);
export const useMeterGate = () => useContext(MeterGateContext);
