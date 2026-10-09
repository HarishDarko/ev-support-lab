// SYNTHETIC DATA. Every site, charger, ticket, log line and number below is made up
// for a prototype. None of it describes a real company, network, customer or person.
// This file is the single source of facts for the demo UI, the live-AI prompts and the case study.
//
// It lives in shared/ because both the browser app (src/) and the Pages Functions (functions/) import it.
// src/data/synthetic.ts re-exports it. Keep it free of DOM, React and Workers-only APIs.

export interface Meta {
  label: string;
  today: string;
  shiftStart: string;
  indiaShiftET: string;
  etGapET: string;
}

export interface Runbook {
  id: string;
  title: string;
  scope: string;
  /** The runbook corrects records (a session, a fee) and does not touch the charger. */
  recordOnly?: boolean;
}

export const COMPONENTS = [
  "session-state",
  "authorization",
  "payments",
  "connectivity",
  "host-portal",
  "driver-app",
  "pricing",
  "hardware-field",
  "roaming",
  "platform-api",
  "request-or-question",
] as const;
export type Component = (typeof COMPONENTS)[number];

export interface Ticket {
  id: string;
  /** Opened time, ET, e.g. "Mon 09:12". */
  opened: string;
  from: string;
  site: string;
  charger: string;
  fw: string;
  text: string;
}

export interface HistoryItem {
  id: string;
  /** Days back from today (0). */
  day: number;
  site: string;
  fw: string;
  text: string;
  resolution: string;
}

export interface UnplugToDrop {
  id: string;
  fw: string;
  s: number;
}

export interface FleetRow {
  fw: string;
  sessions: number;
  dropsNearUnplug: number;
  stuck: number;
  dropsElsewhere: number;
  stuckFromElsewhere: number;
}

/** [time, source, detail] */
export type LogLine = [time: string, source: string, detail: string];

export interface HeroLog {
  title: string;
  lines: LogLine[];
}

export interface Hero {
  key: string;
  incidentId: string;
  name: string;
  openIds: string[];
  historyIds: string[];
  sites: string[];
  firstSeenDay: number;
  totalTickets: number;
  unplugToDropSec: UnplugToDrop[];
  fleet: FleetRow[];
  logs: HeroLog[];
  ruledOut: string[];
  supportNow: string[];
}

export type EscalationKey = "code" | "spread" | "billing" | "safety";

export interface EscalationRule {
  key: EscalationKey;
  text: string;
}

export interface EscalationLine {
  supportOwns: string[];
  escalateWhenAny: EscalationRule[];
  heroTriggers: EscalationKey[];
}

export interface EngineeringChange {
  ref: string;
  /** Days after the handoff (the handoff is day 0). */
  shippedDay: number;
  summary: string;
  rollout: string;
}

export interface VerificationArm {
  dropsNearUnplug: number;
  stuck: number;
}

export interface Verification {
  windowDays: number;
  canary: {
    sites: number;
    before: VerificationArm;
    after: VerificationArm & { closedByReconciliation: number };
  };
  control: { sites: number; before: VerificationArm; after: VerificationArm };
  detector: { hits: number; ticketsOpenedBeforeAnyComplaint: number; medianMinutesToFlag: number };
  complaintsBeforeDetector: { medianHoursToFirstComplaint: number };
  correctness: {
    canarySessions: number;
    reconciled: number;
    falseClosures: number;
    newerTransactionSkips: number;
    lateEndedArrived: number;
    lateEndedApplied: number;
    duplicateCharges: number;
    invoicesReviewed: number;
    invoicesAdjusted: number;
  };
}

export interface DetectorSession {
  id: string;
  charger: string;
  site: string;
  fw: string;
  open: string;
  flatMin: number;
  reconnectSec: number | null;
}

export interface Detector {
  query: string;
  sessions: DetectorSession[];
}

export const META: Meta = {
  label: "Synthetic data · prototype",
  today: "Thu",
  shiftStart: "07:00 ET",
  indiaShiftET: "23:30–08:30 ET",
  etGapET: "08:30–23:30 ET",
};

// recordOnly: the runbook corrects records (a session, a fee) and does not touch the charger,
// so it clears the symptom without changing why it happened.
export const RUNBOOKS: Runbook[] = [
  {
    id: "RB-01",
    title: "Re-push the local authorization list to a charger",
    scope: "RFID cards rejected after a card-list change",
  },
  {
    id: "RB-02",
    title: "Release a stale payment pre-authorization hold",
    scope: "Driver sees a pending hold after a completed or failed session",
  },
  {
    id: "RB-03",
    title: "Recover a charger that stopped sending heartbeats",
    scope:
      "No heartbeat; a remote reset only reaches it once it reconnects, so soft then hard reset when it does; otherwise follow the site's authorised recovery procedure and dispatch field service if still silent after 15 min",
  },
  {
    id: "RB-04",
    title: "Export large host reports in smaller date ranges",
    scope: "Host portal export times out on long ranges",
  },
  {
    id: "RB-05",
    title: "Force-close a stuck session and reverse idle fees",
    scope: "Session shows Charging after the driver has left",
    recordOnly: true,
  },
  { id: "RB-06", title: "Reset host portal access", scope: "Host user locked out or invite expired" },
  {
    id: "RB-07",
    title: "Explain time-of-use pricing settings to a host",
    scope: "Config change still needs the host's written approval",
  },
];

export const SITES: Record<string, string> = {
  "S-011": "Parking garage · NJ",
  "S-014": "Parking garage · NJ",
  "S-019": "Retail lot · NY",
  "S-022": "Hotel · PA",
  "S-027": "Workplace · MD",
  "S-031": "Municipal lot · NY",
  "S-035": "Retail lot · FL",
  "S-038": "Hospital · IL",
  "S-041": "Residential · CA",
  "S-044": "Retail lot · TX",
  "S-047": "Fleet depot · NJ",
  "S-052": "Municipal lot · MD",
  "S-058": "University · NY",
  "S-063": "Retail lot · PA",
  "S-066": "Hotel · FL",
  "S-070": "Workplace · IL",
  "S-073": "DC fast site · CA",
  "S-077": "Car park · UK",
  "S-081": "Supermarket · BE",
};

// The open queue at the 07:00 ET start. `opened` is ET. Raised by internal teams, never by drivers directly.
export const TICKETS: Ticket[] = [
  {
    id: "T-2040",
    opened: "Mon 09:12",
    from: "NOC alert",
    site: "S-044",
    charger: "CP-044-01",
    fw: "FW-C 1.6.2",
    text: "CP-044-01 no heartbeat since 08:47. Site shows 1 of 4 ports offline.",
  },
  {
    id: "T-2041",
    opened: "Mon 10:03",
    from: "Customer care",
    site: "S-014",
    charger: "CP-014-02",
    fw: "FW-B 4.2.1",
    text: "Driver says the app still showed 'Charging' hours after they unplugged at S-014 last night. Idle fee kept running. Asking for a refund.",
  },
  {
    id: "T-2042",
    opened: "Mon 10:20",
    from: "Host accounts",
    site: "S-038",
    charger: "CP-038-03",
    fw: "FW-C 1.6.2",
    text: "Hospital staff badges rejected at CP-038-03 since this morning. Host updated their badge list yesterday afternoon.",
  },
  {
    id: "T-2043",
    opened: "Mon 10:41",
    from: "Customer care",
    site: "S-035",
    charger: "CP-035-02",
    fw: "FW-C 1.6.2",
    text: "Driver's card shows a $50 pending hold from a session that failed to start on Saturday.",
  },
  {
    id: "T-2044",
    opened: "Mon 11:15",
    from: "Host accounts",
    site: "S-019",
    charger: "-",
    fw: "-",
    text: "Host wants a weekly utilization email instead of logging in to the portal. Feature request.",
  },
  {
    id: "T-2045",
    opened: "Mon 11:32",
    from: "Field service",
    site: "S-038",
    charger: "CP-038-01",
    fw: "FW-C 1.6.2",
    text: "On site at S-038. Two more ports rejecting staff badges. Charger is online, card reader works with a test card.",
  },
  {
    id: "T-2046",
    opened: "Mon 12:05",
    from: "NOC alert",
    site: "S-063",
    charger: "CP-063-02",
    fw: "FW-B 4.2.3",
    text: "CP-063-02 offline 41 min. Last message: Heartbeat at 11:24.",
  },
  {
    id: "T-2047",
    opened: "Mon 13:18",
    from: "Host accounts",
    site: "S-031",
    charger: "CP-031-01",
    fw: "FW-B 4.2.3",
    text: "Host at S-031 says CP-031-01 has shown 'In use' on the public map since last night. Nobody is parked there.",
  },
  {
    id: "T-2048",
    opened: "Mon 13:40",
    from: "Billing ops",
    site: "-",
    charger: "-",
    fw: "-",
    text: "Question: can host invoices show sessions grouped by port instead of by day?",
  },
  {
    id: "T-2049",
    opened: "Mon 14:02",
    from: "Customer care",
    site: "S-066",
    charger: "CP-066-01",
    fw: "FW-A 3.9.0",
    text: "Driver has a $35 hold still pending two days after a completed session at S-066.",
  },
  {
    id: "T-2050",
    opened: "Mon 14:30",
    from: "Customer care",
    site: "S-038",
    charger: "CP-038-02",
    fw: "FW-C 1.6.2",
    text: "Third call today about badges not working at the hospital site.",
  },
  {
    id: "T-2051",
    opened: "Mon 15:11",
    from: "Host accounts",
    site: "S-070",
    charger: "-",
    fw: "-",
    text: "Host portal export of a 12-month session report spins and then fails. Smaller exports work.",
  },
  {
    id: "T-2052",
    opened: "Mon 16:20",
    from: "Field service",
    site: "S-044",
    charger: "CP-044-03",
    fw: "FW-C 1.6.2",
    text: "Connector holster on CP-044-03 cracked, cable on the ground. Needs a part. Port taped off.",
  },
  {
    id: "T-2053",
    opened: "Mon 21:40",
    from: "NOC alert",
    site: "S-058",
    charger: "CP-058-04",
    fw: "FW-B 4.2.1",
    text: "Session SX-88301 open 9h 40m with no energy change since 12:02. Connector reports Available.",
  },
  {
    id: "T-2054",
    opened: "Tue 00:15",
    from: "Platform alert",
    site: "-",
    charger: "-",
    fw: "-",
    text: "Elevated 5xx on the auth API 00:10–00:14 ET. Auto-resolved. No follow-up alerts.",
  },
  {
    id: "T-2055",
    opened: "Tue 09:05",
    from: "Customer care",
    site: "S-038",
    charger: "CP-038-04",
    fw: "FW-C 1.6.2",
    text: "Hospital site again. Nurse badge rejected on CP-038-04.",
  },
  {
    id: "T-2056",
    opened: "Tue 09:30",
    from: "NOC alert",
    site: "S-011",
    charger: "CP-011-02",
    fw: "FW-C 1.6.2",
    text: "CP-011-02 no heartbeat for 52 min.",
  },
  {
    id: "T-2057",
    opened: "Tue 10:12",
    from: "Customer care",
    site: "S-041",
    charger: "CP-041-01",
    fw: "FW-B 4.2.3",
    text: "Driver has a $50 hold after a session that stopped after 2 minutes.",
  },
  {
    id: "T-2058",
    opened: "Tue 10:48",
    from: "Customer care",
    site: "S-022",
    charger: "CP-022-04",
    fw: "FW-A 3.9.0",
    text: "Driver can't start a session at another site. App says 'You already have an active session'. They left S-022 about three hours ago.",
  },
  {
    id: "T-2059",
    opened: "Tue 11:20",
    from: "Host accounts",
    site: "S-019",
    charger: "-",
    fw: "-",
    text: "Host asks how time-of-use pricing works and whether we can set evening rates for them.",
  },
  {
    id: "T-2060",
    opened: "Tue 11:55",
    from: "NOC alert",
    site: "S-073",
    charger: "CP-073-01",
    fw: "FW-D 2.0.4",
    text: "DC charger CP-073-01 delivering 50 kW max since 11:30. Site temperature 39°C. No faults reported.",
  },
  {
    id: "T-2061",
    opened: "Tue 12:40",
    from: "Field service",
    site: "S-038",
    charger: "CP-038-03",
    fw: "FW-C 1.6.2",
    text: "Checked CP-038-03 local auth list version: v211. Host portal says the list should be v214.",
  },
  {
    id: "T-2062",
    opened: "Tue 13:10",
    from: "Customer care",
    site: "S-077",
    charger: "CP-077-02",
    fw: "FW-A 3.9.0",
    text: "UK driver says the app showed the price as $0.45/kWh instead of £. Session itself billed correctly in GBP.",
  },
  {
    id: "T-2063",
    opened: "Tue 13:45",
    from: "Host accounts",
    site: "S-052",
    charger: "-",
    fw: "-",
    text: "Host user locked out of the portal after password resets. Needs access today for a council meeting.",
  },
  {
    id: "T-2064",
    opened: "Tue 14:20",
    from: "NOC alert",
    site: "S-052",
    charger: "CP-052-01",
    fw: "FW-B 4.2.1",
    text: "CP-052-01 offline 35 min. Two earlier offline events this week, both cleared by soft reset.",
  },
  {
    id: "T-2065",
    opened: "Tue 15:02",
    from: "Customer care",
    site: "-",
    charger: "-",
    fw: "-",
    text: "Driver app closes on launch for a driver on Android 16, app version 7.12.0. Reinstall did not help.",
  },
  {
    id: "T-2066",
    opened: "Tue 16:30",
    from: "Billing ops",
    site: "S-047",
    charger: "CP-047-02",
    fw: "FW-B 4.2.3",
    text: "Session at S-047 (fleet depot) open over 12h, energy stopped climbing after about 40 min. Fleet manager disputing the idle fee.",
  },
  {
    id: "T-2067",
    opened: "Tue 17:10",
    from: "Customer care",
    site: "S-077",
    charger: "CP-077-01",
    fw: "FW-A 3.9.0",
    text: "Second UK driver report: price shown in dollars in the app at S-077.",
  },
  {
    id: "T-2068",
    opened: "Tue 18:20",
    from: "Host accounts",
    site: "S-081",
    charger: "CP-081-02",
    fw: "FW-C 1.6.2",
    text: "Belgian host says roaming sessions from a partner network are missing from their monthly report.",
  },
  {
    id: "T-2069",
    opened: "Wed 08:45",
    from: "Host accounts",
    site: "S-038",
    charger: "-",
    fw: "-",
    text: "Hospital facilities manager escalating: staff badge problem now on day three.",
  },
  {
    id: "T-2070",
    opened: "Wed 09:20",
    from: "NOC alert",
    site: "S-035",
    charger: "CP-035-03",
    fw: "FW-C 1.6.2",
    text: "CP-035-03 no heartbeat for 47 min.",
  },
  {
    id: "T-2071",
    opened: "Wed 10:05",
    from: "Customer care",
    site: "S-027",
    charger: "CP-027-01",
    fw: "FW-B 4.2.1",
    text: "Driver has a $50 hold that has not dropped off after 3 days.",
  },
  {
    id: "T-2072",
    opened: "Wed 10:50",
    from: "Host accounts",
    site: "S-063",
    charger: "-",
    fw: "-",
    text: "Host report export for Jan–Sep times out.",
  },
  {
    id: "T-2073",
    opened: "Wed 11:30",
    from: "Field service",
    site: "S-066",
    charger: "CP-066-02",
    fw: "FW-A 3.9.0",
    text: "When is the next firmware rollout for S-066? Host wants to schedule around a weekend event.",
  },
  {
    id: "T-2074",
    opened: "Wed 12:15",
    from: "Host accounts",
    site: "S-011",
    charger: "CP-011-01",
    fw: "FW-C 1.6.2",
    text: "Host complains a petrol car keeps parking in the EV bay. Wants us to do something.",
  },
  {
    id: "T-2075",
    opened: "Wed 13:00",
    from: "NOC alert",
    site: "S-070",
    charger: "CP-070-02",
    fw: "FW-B 4.2.3",
    text: "CP-070-02 no heartbeat for 63 min. Soft reset sent by monitoring at 12:30, no response.",
  },
  {
    id: "T-2076",
    opened: "Wed 14:10",
    from: "Host accounts",
    site: "S-041",
    charger: "-",
    fw: "-",
    text: "Host asks for a raw session data export for an internal audit, last 6 months.",
  },
  {
    id: "T-2077",
    opened: "Wed 15:25",
    from: "Host accounts",
    site: "S-044",
    charger: "-",
    fw: "-",
    text: "Large export from host portal failing again.",
  },
  {
    id: "T-2078",
    opened: "Wed 16:40",
    from: "Customer care",
    site: "S-035",
    charger: "CP-035-01",
    fw: "FW-C 1.6.2",
    text: "Driver says a $25 hold appeared even though the session was free (host promotion).",
  },
  {
    id: "T-2079",
    opened: "Wed 22:05",
    from: "NOC alert",
    site: "S-019",
    charger: "CP-019-01",
    fw: "FW-A 3.9.0",
    text: "CP-019-01 offline 38 min.",
  },
];

// Closed in the last 21 days. `day` counts back from today (0). Short summaries only.
export const HISTORY: HistoryItem[] = [
  {
    id: "H-1903",
    day: -21,
    site: "S-014",
    fw: "FW-B 4.2.1",
    text: "Session stayed 'Charging' after driver left. Idle fee complaint.",
    resolution: "RB-05: force-closed, idle fee reversed. Closed as one-off.",
  },
  {
    id: "H-1905",
    day: -21,
    site: "S-044",
    fw: "FW-C 1.6.2",
    text: "Charger offline overnight.",
    resolution: "RB-03 soft reset. Back online.",
  },
  {
    id: "H-1908",
    day: -20,
    site: "S-019",
    fw: "FW-A 3.9.0",
    text: "Host asked about invoice timing.",
    resolution: "Answered.",
  },
  {
    id: "H-1911",
    day: -19,
    site: "S-027",
    fw: "FW-B 4.2.1",
    text: "Driver blocked from new session, app says one is active.",
    resolution: "RB-05: force-closed old session. Closed as one-off.",
  },
  {
    id: "H-1914",
    day: -18,
    site: "S-035",
    fw: "FW-C 1.6.2",
    text: "Pending $50 hold after failed start.",
    resolution: "RB-02: hold released.",
  },
  {
    id: "H-1916",
    day: -18,
    site: "S-070",
    fw: "FW-B 4.2.3",
    text: "Host portal locked.",
    resolution: "RB-06: access reset.",
  },
  {
    id: "H-1919",
    day: -17,
    site: "S-011",
    fw: "FW-C 1.6.2",
    text: "Charger offline.",
    resolution: "RB-03 hard reset. Back online.",
  },
  {
    id: "H-1922",
    day: -16,
    site: "S-031",
    fw: "FW-B 4.2.3",
    text: "Map shows station in use, bay empty.",
    resolution: "RB-05: force-closed session. Closed as one-off.",
  },
  {
    id: "H-1924",
    day: -15,
    site: "S-077",
    fw: "FW-A 3.9.0",
    text: "RFID card rejected after card replacement.",
    resolution: "RB-01: auth list re-pushed.",
  },
  {
    id: "H-1927",
    day: -15,
    site: "S-063",
    fw: "FW-B 4.2.3",
    text: "Driver asked how to get a receipt.",
    resolution: "Answered.",
  },
  {
    id: "H-1930",
    day: -14,
    site: "S-063",
    fw: "FW-B 4.2.3",
    text: "Session open 11h, energy flat after first hour. Idle fee dispute.",
    resolution: "RB-05: force-closed, fee reversed. Closed as one-off.",
  },
  {
    id: "H-1932",
    day: -13,
    site: "S-058",
    fw: "FW-B 4.2.1",
    text: "Charger offline.",
    resolution: "RB-03 soft reset.",
  },
  {
    id: "H-1935",
    day: -13,
    site: "S-066",
    fw: "FW-A 3.9.0",
    text: "Host asked for signage.",
    resolution: "Forwarded to host accounts.",
  },
  {
    id: "H-1938",
    day: -12,
    site: "S-019",
    fw: "FW-A 3.9.0",
    text: "Session still 'Charging' after unplug. Driver called twice.",
    resolution: "RB-05: force-closed. Closed as one-off.",
  },
  {
    id: "H-1940",
    day: -11,
    site: "S-041",
    fw: "FW-B 4.2.3",
    text: "Pending hold after completed session.",
    resolution: "RB-02: hold released.",
  },
  {
    id: "H-1942",
    day: -11,
    site: "S-081",
    fw: "FW-C 1.6.2",
    text: "RFID rejected at new site.",
    resolution: "RB-01: auth list re-pushed.",
  },
  {
    id: "H-1944",
    day: -10,
    site: "S-052",
    fw: "FW-B 4.2.1",
    text: "Charger offline twice in one day.",
    resolution: "RB-03 soft reset both times.",
  },
  {
    id: "H-1947",
    day: -9,
    site: "S-070",
    fw: "FW-B 4.2.3",
    text: "Workplace host: port shows in use all weekend, nobody there.",
    resolution: "RB-05: force-closed. Closed as one-off.",
  },
  {
    id: "H-1949",
    day: -9,
    site: "S-022",
    fw: "FW-A 3.9.0",
    text: "Driver wanted to change payment card.",
    resolution: "Answered.",
  },
  {
    id: "H-1951",
    day: -8,
    site: "S-073",
    fw: "FW-D 2.0.4",
    text: "DC charger slow in afternoon heat.",
    resolution: "Explained derating. Closed.",
  },
  {
    id: "H-1953",
    day: -8,
    site: "S-038",
    fw: "FW-C 1.6.2",
    text: "Card reader faulty on one port.",
    resolution: "Field service replaced reader.",
  },
  {
    id: "H-1955",
    day: -7,
    site: "S-014",
    fw: "FW-B 4.2.1",
    text: "Session open after unplug again at the garage. Refund requested.",
    resolution: "RB-05: force-closed, refunded. Closed as one-off.",
  },
  {
    id: "H-1957",
    day: -6,
    site: "S-047",
    fw: "FW-B 4.2.3",
    text: "Fleet manager asked about session export.",
    resolution: "RB-04 guidance sent.",
  },
  {
    id: "H-1959",
    day: -5,
    site: "S-035",
    fw: "FW-C 1.6.2",
    text: "Charger offline after storm.",
    resolution: "Field service dispatched, modem replaced.",
  },
  {
    id: "H-1962",
    day: -4,
    site: "S-047",
    fw: "FW-B 4.2.3",
    text: "Depot session open overnight with flat energy.",
    resolution: "RB-05: force-closed. Closed as one-off.",
  },
  {
    id: "H-1964",
    day: -4,
    site: "S-011",
    fw: "FW-C 1.6.2",
    text: "Host asked for a second admin user.",
    resolution: "Done.",
  },
  {
    id: "H-1966",
    day: -3,
    site: "S-077",
    fw: "FW-A 3.9.0",
    text: "Driver asked about VAT on receipt.",
    resolution: "Answered.",
  },
  {
    id: "H-1968",
    day: -2,
    site: "S-027",
    fw: "FW-B 4.2.1",
    text: "Session showed Charging for 8h after driver left.",
    resolution: "RB-05: force-closed, fee reversed. Closed as one-off.",
  },
  {
    id: "H-1970",
    day: -2,
    site: "S-044",
    fw: "FW-C 1.6.2",
    text: "Pending hold.",
    resolution: "RB-02: hold released.",
  },
  { id: "H-1972", day: -1, site: "S-066", fw: "FW-A 3.9.0", text: "Charger offline.", resolution: "RB-03 soft reset." },
];

// The incident the demo follows. Fixed facts; the AI reads them, it does not invent them.
export const HERO: Hero = {
  key: "stuck-session",
  incidentId: "INC-0412",
  name: "Sessions stay open after a charger reconnects",
  openIds: ["T-2041", "T-2047", "T-2053", "T-2058", "T-2066"],
  historyIds: ["H-1903", "H-1911", "H-1922", "H-1930", "H-1938", "H-1947", "H-1955", "H-1962", "H-1968"],
  sites: ["S-014", "S-019", "S-022", "S-027", "S-031", "S-047", "S-058", "S-063", "S-070"],
  firstSeenDay: -21,
  totalTickets: 14,
  // Seconds between the driver unplugging and the charger's websocket dropping, per stuck session.
  unplugToDropSec: [
    { id: "H-1903", fw: "FW-B", s: 22 },
    { id: "H-1911", fw: "FW-B", s: 7 },
    { id: "H-1922", fw: "FW-B", s: 31 },
    { id: "H-1930", fw: "FW-B", s: 44 },
    { id: "H-1938", fw: "FW-A", s: 12 },
    { id: "H-1947", fw: "FW-B", s: 58 },
    { id: "H-1955", fw: "FW-B", s: 3 },
    { id: "H-1962", fw: "FW-B", s: 66 },
    { id: "H-1968", fw: "FW-B", s: 18 },
    { id: "T-2041", fw: "FW-B", s: 51 },
    { id: "T-2047", fw: "FW-B", s: 25 },
    { id: "T-2053", fw: "FW-B", s: 88 },
    { id: "T-2058", fw: "FW-A", s: 7 },
    { id: "T-2066", fw: "FW-B", s: 38 },
  ],
  // 21-day fleet view by firmware line.
  fleet: [
    { fw: "FW-B 4.2.x", sessions: 4812, dropsNearUnplug: 19, stuck: 12, dropsElsewhere: 41, stuckFromElsewhere: 0 },
    { fw: "FW-A 3.9.x", sessions: 3950, dropsNearUnplug: 11, stuck: 2, dropsElsewhere: 37, stuckFromElsewhere: 0 },
    { fw: "FW-C 1.6.x", sessions: 2204, dropsNearUnplug: 6, stuck: 0, dropsElsewhere: 22, stuckFromElsewhere: 0 },
  ],
  // Synthetic OCPP 2.0.1 excerpts (OCPP-J over websocket), as the backend gateway summarised them.
  // Gateway lines are summaries, not full payloads. Charger-side logs are not available to support.
  logs: [
    {
      title: "S-014 · CP-014-02 · FW-B 4.2.1 · T-2041",
      lines: [
        [
          "22:41:07",
          "CP-014-02 → TransactionEvent",
          "eventType=Updated  transactionId=88213  seqNo=40  meter=18.42 kWh",
        ],
        [
          "22:41:52",
          "CP-014-02 → TransactionEvent",
          "eventType=Updated  transactionId=88213  seqNo=41  triggerReason=EVCommunicationLost",
        ],
        ["22:42:43", "gateway", "connection lost (websocket 1006, no close frame)"],
        ["22:43:11", "gateway", "websocket opened  CP-014-02"],
        ["22:43:12", "CP-014-02 → StatusNotification", "evseId=1  connectorStatus=Available"],
        ["22:43:42", "CP-014-02 → Heartbeat", ""],
        [
          "22:43:42",
          "session-svc",
          "transactionId=88213 state=Charging  last_meter=18.42 kWh  (no TransactionEvent Ended received)",
        ],
        ["06:10:00", "session-svc", "transactionId=88213 open 7h 29m, idle fee accruing"],
      ],
    },
    {
      title: "S-031 · CP-031-01 · FW-B 4.2.3 · T-2047",
      lines: [
        [
          "23:58:30",
          "CP-031-01 → TransactionEvent",
          "eventType=Updated  transactionId=88177  seqNo=27  triggerReason=EVCommunicationLost",
        ],
        ["23:58:55", "gateway", "connection lost (websocket 1006, no close frame)"],
        ["00:00:02", "gateway", "websocket opened  CP-031-01"],
        ["00:00:03", "CP-031-01 → StatusNotification", "evseId=1  connectorStatus=Available"],
        ["00:00:03", "session-svc", "transactionId=88177 state=Charging  (no TransactionEvent Ended received)"],
        ["13:18:00", "map-svc", "CP-031-01 shown 'In use' (derived from open session)"],
      ],
    },
    {
      title: "S-022 · CP-022-04 · FW-A 3.9.0 · T-2058",
      lines: [
        [
          "07:41:40",
          "CP-022-04 → TransactionEvent",
          "eventType=Updated  transactionId=87640  seqNo=8  triggerReason=EVCommunicationLost",
        ],
        ["07:41:47", "gateway", "connection lost (websocket 1006, no close frame)"],
        ["07:42:30", "gateway", "websocket opened  CP-022-04"],
        ["07:42:31", "CP-022-04 → StatusNotification", "evseId=2  connectorStatus=Available"],
        [
          "07:42:52",
          "CP-022-04 → TransactionEvent",
          "eventType=Ended  transactionId=87640  offline=true  seqNo=9  stoppedReason=EVDisconnected",
        ],
        [
          "07:42:52",
          "session-svc",
          "TransactionEvent Ended transactionId=87640 ignored: connector already Available (out of order)",
        ],
        ["07:42:52", "CP-022-04 ← TransactionEventResponse", "(empty payload)"],
      ],
    },
  ],
  ruledOut: [
    "Payment provider: no incidents logged in the 21-day window; holds and captures normal on unaffected sessions.",
    "Driver app display: the session API itself returns state=Charging, so the app is showing what the backend holds.",
    "Single site or charger fault: 14 tickets across 9 sites and two firmware lines.",
    "Driver behaviour: every affected connector reported Available within 2 minutes of unplug.",
  ],
  supportNow: [
    "Containment under the incident: the 5 open sessions corrected with RB-05, each closed at its own last recorded meter value, idle fees reversed, invoice flagged for billing review. The 5 tickets stay open on the incident; none is closed as a one-off.",
    "Read-only detector query written, proposed to run every 15 min: open session, no meter change for 30 min, websocket reconnect within 90 s of the unplug event. Each hit would become a candidate ticket for a person to review, at most 45 min after the session goes flat.",
  ],
};

// When support owns it, and when it crosses to engineering. A proposed line, not an existing policy.
export const ESCALATION_LINE: EscalationLine = {
  supportOwns: [
    "A runbook exists and fixes it",
    "No code, firmware or production config change needed",
    "One site or one charger",
  ],
  escalateWhenAny: [
    { key: "code", text: "Needs a code, firmware or production config change" },
    { key: "spread", text: "Same pattern at 3+ sites, or recurring for 2+ weeks" },
    { key: "billing", text: "Billing or session data correctness at risk" },
    { key: "safety", text: "Any safety concern" },
  ],
  heroTriggers: ["code", "spread", "billing"],
};

// What engineering shipped after the handoff, and two weeks of results. Synthetic.
export const ENGINEERING_CHANGE: EngineeringChange = {
  ref: "ENG-4471",
  shippedDay: 6, // days after the handoff (handoff is day 0)
  summary:
    "When a charger reconnects while the backend holds an open transaction on it, the backend asks the charger (GetTransactionStatus) and keeps the transaction open while messages are queued. Events are keyed on the station, transactionId and seqNo, and applied once, in seqNo order, whatever the EVSE status. The backend closes a transaction provisionally, at its own last recorded meter value, only when the charger reports it is not ongoing with nothing queued, the event sequence has no gaps, and recorded energy is flat; the invoice is then marked provisional for billing review. Anything else (energy still rising, no ongoing report, a sequence gap, or a newer transaction on the same EVSE) goes to a person. A late Ended after a provisional close replaces the provisional values once and does not create a second charge.",
  rollout:
    "Behind a per-station flag on 5 canary sites running FW-B 4.2.x; 6 control sites (4 FW-B, 2 FW-A) stay on the old behaviour, so the control is not perfectly matched. Firmware vendor ticket opened for FW-B behaviour after reconnect; still open.",
};

export const VERIFICATION: Verification = {
  windowDays: 14,
  canary: {
    sites: 5,
    before: { dropsNearUnplug: 6, stuck: 5 },
    after: { dropsNearUnplug: 6, stuck: 0, closedByReconciliation: 5 }, // the sixth had a newer transaction: left for a person
  },
  control: { sites: 6, before: { dropsNearUnplug: 5, stuck: 4 }, after: { dropsNearUnplug: 6, stuck: 4 } },
  detector: { hits: 4, ticketsOpenedBeforeAnyComplaint: 4, medianMinutesToFlag: 31 },
  complaintsBeforeDetector: { medianHoursToFirstComplaint: 6.2 },
  correctness: {
    canarySessions: 2140,
    reconciled: 5,
    falseClosures: 0, // no reconciled transaction had rising energy or an ongoing report
    newerTransactionSkips: 1, // one reconnect where a new transaction had already started; left alone
    lateEndedArrived: 3,
    lateEndedApplied: 3, // replaced provisional values once each
    duplicateCharges: 0,
    invoicesReviewed: 5,
    invoicesAdjusted: 1, // provisional energy differed from the late Ended by 0.4 kWh
  },
};

// Open sessions at 07:40 ET on day 0, the detector's input. Synthetic.
export const DETECTOR: Detector = {
  query: "open sessions WHERE minutes_since_meter_change >= 30 AND reconnect_within_90s_of_unplug",
  sessions: [
    {
      id: "SX-88402",
      charger: "CP-047-03",
      site: "S-047",
      fw: "FW-B 4.2.3",
      open: "2h 10m",
      flatMin: 98,
      reconnectSec: 41,
    },
    {
      id: "SX-88415",
      charger: "CP-063-02",
      site: "S-063",
      fw: "FW-B 4.2.3",
      open: "1h 05m",
      flatMin: 52,
      reconnectSec: 17,
    },
    {
      id: "SX-88420",
      charger: "CP-019-02",
      site: "S-019",
      fw: "FW-A 3.9.0",
      open: "3h 00m",
      flatMin: 1,
      reconnectSec: null,
    },
    {
      id: "SX-88431",
      charger: "CP-070-01",
      site: "S-070",
      fw: "FW-B 4.2.3",
      open: "0h 40m",
      flatMin: 35,
      reconnectSec: null,
    },
    {
      id: "SX-88433",
      charger: "CP-031-02",
      site: "S-031",
      fw: "FW-B 4.2.3",
      open: "4h 05m",
      flatMin: 2,
      reconnectSec: null,
    },
    {
      id: "SX-88437",
      charger: "CP-058-01",
      site: "S-058",
      fw: "FW-B 4.2.1",
      open: "1h 20m",
      flatMin: 64,
      reconnectSec: 140,
    },
    {
      id: "SX-88440",
      charger: "CP-014-01",
      site: "S-014",
      fw: "FW-B 4.2.1",
      open: "0h 50m",
      flatMin: 12,
      reconnectSec: null,
    },
  ],
};

// A ticket that arrives after the knowledge base article exists (step 7).
export const NEW_TICKET_EXAMPLE: string =
  "NOC: session SX-89412 on CP-063-02 (S-063) open 7h, no energy change since 22:10. Charger dropped its connection at 22:09 and came back at 22:11.";
