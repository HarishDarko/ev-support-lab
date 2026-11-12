// SYNTHETIC DATA. Every order, ticket and number below is made up for a prototype. None of it describes a real
// company, shop, customer or person.
// E-commerce pack: the internal support desk of a made-up online homeware shop.
import type { PackRunbook } from "../types";

export interface ShopTicket {
  id: string;
  /** Opened time, ET, e.g. "Mon 09:12". */
  opened: string;
  from: string;
  order: string;
  channel: string;
  text: string;
  /** Not used by this pack; the engine reads it for runbook exceptions. */
  fw?: string;
}

export interface ShopHistoryItem {
  id: string;
  /** Days back from today (0). */
  day: number;
  order: string;
  fw: string;
  text: string;
  resolution: string;
}

export const COMPONENTS = [
  "order-status",
  "delivery",
  "returns-refunds",
  "payments",
  "product-issue",
  "account-access",
  "request-or-question",
] as const;
export type Component = (typeof COMPONENTS)[number];

export const RUNBOOKS: PackRunbook[] = [
  {
    id: "RB-21",
    title: "Release a stuck order hold and void the duplicate authorization",
    scope:
      "Payment processor shows one settled capture and one open duplicate authorization of the same amount for the order",
    recordOnly: true,
  },
  {
    id: "RB-22",
    title: "Open a carrier claim for a parcel marked delivered",
    scope: "Tracking says delivered, the customer checked neighbours and safe places, and 48 hours have passed",
  },
  {
    id: "RB-23",
    title: "Send a replacement for an item that arrived damaged",
    scope: "Item broken or damaged on arrival; photo received",
  },
  {
    id: "RB-24",
    title: "Trace a refund with the payment processor",
    scope: "Refund issued more than 5 business days ago and not on the customer's statement",
  },
  {
    id: "RB-25",
    title: "Change the delivery address before the order is picked",
    scope:
      "Order not yet picked, or the warehouse confirms a hold; new address in the same country and passes the fraud check",
  },
  {
    id: "RB-26",
    title: "Recover account access after an identity check",
    scope:
      "Customer cannot sign in or get the reset email; check the email suppression list first; confirm identity with the card's last 4 digits and billing address before changing the sign-in email",
  },
];

// The open queue at the 07:00 ET start. Raised by internal teams, never by customers directly.
export const TICKETS: ShopTicket[] = [
  {
    id: "T-4001",
    opened: "Mon 08:00",
    from: "Customer care",
    order: "#48213",
    channel: "Email",
    text: "Tracking for order #48213 says delivered two days ago, but nothing arrived and the neighbours have not seen it.",
  },
  {
    id: "T-4002",
    opened: "Mon 08:35",
    from: "Payments ops",
    order: "#51102",
    channel: "Web",
    text: "Order #51102 stuck in Payment pending although the card payment went through. A second authorization is still open on the card.",
  },
  {
    id: "T-4003",
    opened: "Mon 09:05",
    from: "Customer care",
    order: "#51877",
    channel: "Chat",
    text: "Ceramic mug from order #51877 arrived broken in the box. Customer sent a photo and wants a replacement.",
  },
  {
    id: "T-4004",
    opened: "Mon 09:40",
    from: "Customer care",
    order: "#49920",
    channel: "Email",
    text: "Refund for order #49920 was issued 8 business days ago and is still not on the customer's bank statement.",
  },
  {
    id: "T-4005",
    opened: "Mon 10:10",
    from: "Customer care",
    order: "#52330",
    channel: "Chat",
    text: "Customer wants to change the delivery address for order #52330. Order status is Packing, not yet shipped.",
  },
  {
    id: "T-4006",
    opened: "Mon 10:45",
    from: "Warehouse",
    order: "#51150",
    channel: "App",
    text: "Order #51150 never reached the pick list, so its next-day delivery promise was missed. The order screen says Payment pending; the customer says they paid once.",
  },
  {
    id: "T-4007",
    opened: "Mon 11:20",
    from: "Site monitor",
    order: "-",
    channel: "Web",
    text: "[SEV-2] Checkout HTTP 500 rate at 6.4% after a deploy, about 40 failed checkouts in 5 minutes. Cleared at 11:12 after the rollback; check failed orders for open authorizations.",
  },
  {
    id: "T-4008",
    opened: "Mon 12:00",
    from: "Customer care",
    order: "-",
    channel: "Email",
    text: "Customer cannot sign in and the password reset email never arrives. They gave the last order number and postcode.",
  },
  {
    id: "T-4009",
    opened: "Mon 12:40",
    from: "Customer care",
    order: "#50418",
    channel: "Chat",
    text: "Tracking for #50418 shows delivered this morning but the customer has not found it yet.",
  },
  {
    id: "T-4010",
    opened: "Mon 13:15",
    from: "Customer care",
    order: "#51209",
    channel: "App",
    text: "Customer sent a screenshot of two settled charges on their card for order #51209, which is still stuck in Payment pending.",
  },
  {
    id: "T-4011",
    opened: "Mon 14:00",
    from: "Customer care",
    order: "#52011",
    channel: "Email",
    text: "Customer asks to change the address on #52011, but it was dispatched yesterday.",
  },
  {
    id: "T-4012",
    opened: "Mon 14:30",
    from: "Customer care",
    order: "#52104",
    channel: "Chat",
    text: "Checkout blocks delivery to the customer's Belfast postcode for a floor mirror, although our shipping policy covers Northern Ireland.",
  },
  {
    id: "T-4013",
    opened: "Mon 15:10",
    from: "Warehouse",
    order: "#51990",
    channel: "-",
    text: "Order #51990 held at the pack station: the sage cushion covers are out of stock after damaged bin inventory. Care needs to offer navy or a partial refund before dispatch.",
  },
  {
    id: "T-4014",
    opened: "Mon 15:45",
    from: "Customer care",
    order: "#50777",
    channel: "App",
    text: "Lamp from #50777 flickers when switched on. Customer says it was fine for the first week.",
  },
  {
    id: "T-4015",
    opened: "Mon 16:30",
    from: "Fraud",
    order: "#52401",
    channel: "Web",
    text: "Order #52401 has billing and delivery addresses in different countries and three failed card attempts before success.",
  },
  {
    id: "T-4016",
    opened: "Tue 08:20",
    from: "Customer care",
    order: "#49655",
    channel: "Email",
    text: "Partial refund for #49655 failed in the admin tool with 'Processor error: charge already disputed'. Customer says they did not file a chargeback.",
  },
  {
    id: "T-4017",
    opened: "Tue 09:00",
    from: "Customer care",
    order: "#51320",
    channel: "Chat",
    text: "Glass vase from #51320 arrived chipped. Customer sent photos.",
  },
  {
    id: "T-4018",
    opened: "Tue 09:45",
    from: "Customer care",
    order: "#51388",
    channel: "App",
    text: "Customer's banking app shows two pending holds of £42.00 from us for order #51388, but they placed one order. The app spun for a while and then confirmed.",
  },
  {
    id: "T-4019",
    opened: "Tue 10:30",
    from: "Marketplace ops",
    order: "-",
    channel: "-",
    text: "Product page for the oak side table shows the wrong dimensions. Several customers asked about it.",
  },
  {
    id: "T-4020",
    opened: "Tue 11:10",
    from: "Customer care",
    order: "-",
    channel: "Email",
    text: "Customer wants to know if we can gift wrap an order and add a message.",
  },
  {
    id: "T-4021",
    opened: "Tue 11:45",
    from: "Customer care",
    order: "#50190",
    channel: "Email",
    text: "Return parcel for #50190 was delivered to the warehouse 5 business days ago, but no refund has been issued yet.",
  },
  {
    id: "T-4022",
    opened: "Tue 12:20",
    from: "Customer care",
    order: "#52388",
    channel: "Web",
    text: "Checkout showed 'Something went wrong' after the Pay button spun for about ten seconds, so the customer paid again and got a confirmation. Order #52388 now says Payment pending.",
  },
];

// Closed tickets from the last 21 days, with how they were resolved. The resolution starts with the runbook id when
// a runbook resolved it.
export const HISTORY: ShopHistoryItem[] = [
  {
    id: "H-4101",
    day: -20,
    order: "#47110",
    fw: "-",
    text: "Order stuck in Payment pending after payment; second authorization open.",
    resolution: "RB-21: hold released, extra authorization voided.",
  },
  {
    id: "H-4102",
    day: -19,
    order: "#47302",
    fw: "-",
    text: "Parcel marked delivered, not received after three days.",
    resolution: "RB-22: carrier claim opened, replacement sent.",
  },
  {
    id: "H-4103",
    day: -17,
    order: "#47555",
    fw: "-",
    text: "Plate arrived cracked.",
    resolution: "RB-23: replacement sent.",
  },
  {
    id: "H-4104",
    day: -16,
    order: "#47610",
    fw: "-",
    text: "Order stuck in Payment pending after a successful card payment.",
    resolution: "RB-21: hold released.",
  },
  {
    id: "H-4105",
    day: -14,
    order: "#47801",
    fw: "-",
    text: "Refund not visible after 7 business days.",
    resolution: "RB-24: processor trace found it; reference sent to the customer.",
  },
  {
    id: "H-4106",
    day: -13,
    order: "#47933",
    fw: "-",
    text: "Address change requested before dispatch.",
    resolution: "RB-25: address changed.",
  },
  {
    id: "H-4107",
    day: -11,
    order: "#48020",
    fw: "-",
    text: "Order stuck in Payment pending; processor showed two settled captures for the same order.",
    resolution:
      "Escalated to payments engineering: duplicate capture refunded and the order hold released for dispatch.",
  },
  {
    id: "H-4108",
    day: -10,
    order: "#48150",
    fw: "-",
    text: "Customer locked out, reset email not arriving.",
    resolution: "RB-26: access recovered after identity check.",
  },
  {
    id: "H-4109",
    day: -9,
    order: "#48266",
    fw: "-",
    text: "Order stuck in Payment pending after the capture webhook timed out; one capture, no extra authorization.",
    resolution: "Re-synced the capture webhook to release the hold; no authorization to void.",
  },
  {
    id: "H-4110",
    day: -8,
    order: "-",
    fw: "-",
    text: "Asked about delivery times to Ireland.",
    resolution: "Answered from the shipping page; no runbook.",
  },
  {
    id: "H-4111",
    day: -6,
    order: "#48444",
    fw: "-",
    text: "Wrong item picked in the warehouse.",
    resolution: "Warehouse re-picked before dispatch; no runbook.",
  },
  {
    id: "H-4112",
    day: -5,
    order: "#48512",
    fw: "-",
    text: "Parcel shown delivered but not received the same day.",
    resolution: "Asked the customer to wait 48 hours; it turned up.",
  },
  {
    id: "H-4113",
    day: -4,
    order: "#48601",
    fw: "-",
    text: "Order stuck in Payment pending after payment.",
    resolution: "RB-21: hold released.",
  },
  {
    id: "H-4114",
    day: -2,
    order: "#48777",
    fw: "-",
    text: "Bowl arrived broken.",
    resolution: "RB-23: replacement sent.",
  },
  {
    id: "H-4115",
    day: -1,
    order: "#48802",
    fw: "-",
    text: "Address change asked after dispatch.",
    resolution: "Carrier redirect requested by care; no runbook.",
  },
];

/** The ticket the new-ticket check starts from. */
export const NEW_TICKET_EXAMPLE =
  "Order #52510 is stuck in Payment pending even though the payment went through. A second authorization is still open.";
