// The incident the screens show. EV charging's is the default (it is in the page); every other industry provides
// its own through IncidentContext.
import { createContext, useContext } from "react";
import { EV_INCIDENT } from "./ev-charging";
import type { Incident } from "./types";

export { EV_INCIDENT };
export type { Incident } from "./types";

export const IncidentContext = createContext<Incident>(EV_INCIDENT);

export const useIncident = (): Incident => useContext(IncidentContext);
