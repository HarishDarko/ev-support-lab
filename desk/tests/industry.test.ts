// SD-11: which industry the desk shows, and the plain-words wait estimate for a live run.
import { describe, it, expect } from "vitest";
import { DEFAULT_PACK_ID, PACKS } from "../shared/packs";
import {
  INDUSTRY_OPTIONS,
  fieldLabel,
  resolveIndustry,
  withIndustry,
  type IndustryOption,
} from "../src/packs/industry";
import { chainSeconds } from "../src/run/cost";
import { recordedRun } from "../src/run/recorded";

const TWO: IndustryOption[] = [
  { id: "ev-charging", name: "EV charging" },
  // A made-up option list, so the tests do not depend on which packs exist.
  { id: "saas-support", name: "SaaS support" },
];

describe("the Industry menu's choices", () => {
  it("offers only complete packs, the default first", () => {
    expect(INDUSTRY_OPTIONS).toEqual([
      { id: "ev-charging", name: "EV charging" },
      { id: "saas-support", name: "SaaS support" },
      { id: "e-commerce", name: "E-commerce" },
    ]);
    expect(PACKS[DEFAULT_PACK_ID].complete).toBe(true);
  });
});

describe("resolveIndustry", () => {
  it("defaults to EV charging", () => {
    expect(resolveIndustry("", null)).toBe("ev-charging");
  });
  it("a ?pack= link wins over the stored pick, when that pack is offered", () => {
    expect(resolveIndustry("?pack=saas-support", "ev-charging", TWO)).toBe("saas-support");
    expect(resolveIndustry("?desk=queue&pack=ev-charging", "saas-support", TWO)).toBe("ev-charging");
  });
  it("uses the stored pick when the link names none", () => {
    expect(resolveIndustry("?desk=queue", "saas-support", TWO)).toBe("saas-support");
  });
  it("falls back to the default for unknown, incomplete or hostile values", () => {
    for (const bad of ["?pack=telecom", "?pack=__proto__", "?pack=", "?pack=EV-CHARGING"])
      expect(resolveIndustry(bad, "nonsense"), bad).toBe("ev-charging");
    expect(resolveIndustry("?pack=shop", "shop", TWO)).toBe("ev-charging");
  });
});

describe("withIndustry", () => {
  it("keeps the default pack out of the address, so old links stay the same", () => {
    expect(withIndustry("?desk=queue&pack=saas-support", "ev-charging")).toBe("?desk=queue");
    expect(withIndustry("", "ev-charging")).toBe("");
  });
  it("sets the pack and keeps other parameters", () => {
    expect(withIndustry("?desk=queue", "saas-support")).toBe("?desk=queue&pack=saas-support");
  });
});

describe("fieldLabel", () => {
  it("gives the EV queue its own column names", () => {
    expect(fieldLabel("ev-charging", "site", "x")).toBe("Site");
    expect(fieldLabel("ev-charging", "charger", "x")).toBe("Charger");
    expect(fieldLabel("ev-charging", "fw", "x")).toBe("Firmware");
    expect(fieldLabel("ev-charging", "nope", "Fallback")).toBe("Fallback");
  });
});

describe("chainSeconds", () => {
  it("is about 26 seconds for the committed recorded run (its own step times, investigation started at once)", () => {
    expect(chainSeconds(recordedRun().steps)).toBe(26);
  });
});
