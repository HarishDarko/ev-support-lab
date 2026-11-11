// The incident the screens show. Today only EV charging has one, so it is the default; a pack with its own
// incident provides it through IncidentContext.
import { createContext, useContext } from "react";
import { EV_INCIDENT } from "./ev-charging";
import type { Incident } from "./types";

export { EV_INCIDENT };
export type { Incident } from "./types";

export const IncidentContext = createContext<Incident>(EV_INCIDENT);

export const useIncident = (): Incident => useContext(IncidentContext);
