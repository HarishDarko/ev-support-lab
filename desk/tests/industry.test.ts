// SD-11 and SD-15: which industry the desk shows (or the choice of industries), and the plain-words wait estimate
// for a live run.
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

describe("the industries on offer", () => {
  it("are the complete packs with their incident walkthrough, in the registry's order", () => {
    expect(INDUSTRY_OPTIONS).toEqual([
      { id: "ev-charging", name: "EV charging" },
      { id: "saas-support", name: "SaaS support" },
      { id: "e-commerce", name: "E-commerce" },
    ]);
    expect(PACKS[DEFAULT_PACK_ID].complete).toBe(true);
  });
});

describe("resolveIndustry", () => {
  it("opens on the choice of industries when the address names none, old desk links included", () => {
    expect(resolveIndustry("")).toBeNull();
    expect(resolveIndustry("?desk=queue")).toBeNull();
    expect(resolveIndustry("?desk=queue", TWO)).toBeNull();
  });
  it("a ?pack= link goes straight to that industry, when it is offered", () => {
    expect(resolveIndustry("?pack=saas-support", TWO)).toBe("saas-support");
    expect(resolveIndustry("?desk=queue&pack=ev-charging", TWO)).toBe("ev-charging");
    expect(resolveIndustry("?pack=e-commerce")).toBe("e-commerce");
  });
  it("opens on the choice for unknown, unoffered or hostile values", () => {
    for (const bad of ["?pack=telecom", "?pack=__proto__", "?pack=", "?pack=EV-CHARGING"])
      expect(resolveIndustry(bad), bad).toBeNull();
    expect(resolveIndustry("?pack=e-commerce", TWO)).toBeNull();
  });
});

describe("withIndustry", () => {
  it("puts every industry in the address, EV charging too, so a reload opens the same one", () => {
    expect(withIndustry("?desk=queue&pack=saas-support", "ev-charging")).toBe("?desk=queue&pack=ev-charging");
    expect(withIndustry("", "ev-charging")).toBe("?pack=ev-charging");
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
