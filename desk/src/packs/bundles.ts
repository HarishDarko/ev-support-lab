// What the walkthrough needs for one industry: its desk pack (queue, rules, recorded run) and its incident. EV
// charging's is in the page; another industry with an incident loads its own when picked, so the EV page carries
// none of its data.
import { useEffect, useState } from "react";
import type { PackId } from "../../shared/packs";
import { EV_INCIDENT } from "../incident/ev-charging";
import type { Incident } from "../incident/types";
import { EV_DESK, type DeskPack } from "../run/pack";
import { hasIncident } from "./industry";

export interface PackBundle {
  desk: DeskPack;
  incident: Incident;
}

export const EV_BUNDLE: PackBundle = { desk: EV_DESK, incident: EV_INCIDENT };

const LOADERS: Partial<Record<PackId, () => Promise<PackBundle>>> = {
  "saas-support": () => import("./saas-desk").then((m) => m.SAAS_BUNDLE),
};

/** Which bundle an industry shows: its own when it has an incident walkthrough, else EV's (its queue page is separate). */
const ownBundle = (id: PackId): boolean => hasIncident(id) && id !== EV_BUNDLE.desk.id && Boolean(LOADERS[id]);

/**
 * The bundle for the picked industry. Null while an industry's own bundle is loading; `failed` when it did not load.
 */
export function usePackBundle(id: PackId): { bundle: PackBundle | null; failed: boolean } {
  const [loaded, setLoaded] = useState<{ id: PackId; bundle: PackBundle | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!ownBundle(id)) return;
    let live = true;
    LOADERS[id]!().then(
      (bundle) => live && setLoaded({ id, bundle, failed: false }),
      () => live && setLoaded({ id, bundle: null, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [id]);
  if (!ownBundle(id)) return { bundle: EV_BUNDLE, failed: false };
  if (loaded?.id !== id) return { bundle: null, failed: false };
  return { bundle: loaded.bundle, failed: loaded.failed };
}
