// The read-only detector support proposed: open sessions with no meter change for a while that reconnected
// soon after the unplug. It only finds candidates; a person confirms each one.
import { DETECTOR, type DetectorSession } from "../../data/synthetic";

/** Thresholds of DETECTOR.query: no meter change for at least this long ... */
export const FLAT_MINUTES = 30;
/** ... and a reconnect within this many seconds of the unplug. */
export const RECONNECT_SECONDS = 90;

export const isCandidate = (s: DetectorSession): boolean =>
  s.flatMin >= FLAT_MINUTES && s.reconnectSec != null && s.reconnectSec <= RECONNECT_SECONDS;

/** Why a session is or is not a candidate. */
export function detectorReason(s: DetectorSession): string {
  if (isCandidate(s)) return "Candidate for review";
  if (s.flatMin < FLAT_MINUTES) return `Flat for ${s.flatMin} min: under the ${FLAT_MINUTES} min threshold`;
  if (s.reconnectSec == null) return "No reconnect after unplug: not this pattern";
  return `Reconnect ${s.reconnectSec} s after unplug: outside ${RECONNECT_SECONDS} s`;
}

export const detectorRun = () => ({
  query: DETECTOR.query,
  sessions: DETECTOR.sessions.map((session) => ({
    session,
    candidate: isCandidate(session),
    reason: detectorReason(session),
  })),
});
