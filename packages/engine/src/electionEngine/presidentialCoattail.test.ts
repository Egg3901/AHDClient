import { describe, it, expect } from "vitest";
import {
  isHeadOfGovernmentRace,
  buildPresidentialModifierByParty,
  presidentialModifierToPct,
} from "./presidentialCoattail.js";

describe("isHeadOfGovernmentRace", () => {
  it("is true for the US president race", () => {
    expect(isHeadOfGovernmentRace("president", "US")).toBe(true);
  });

  it("is false for a down-ballot US race", () => {
    expect(isHeadOfGovernmentRace("senate", "US")).toBe(false);
  });

  it("is false for countries with no presidential head-of-government", () => {
    expect(isHeadOfGovernmentRace("president", "UK")).toBe(false);
  });
});

describe("buildPresidentialModifierByParty (approval-based)", () => {
  const inRace = new Set(["2", "3"]);

  it("returns neutral (empty) when no president", () => {
    expect(buildPresidentialModifierByParty(null, inRace).size).toBe(0);
  });

  it("returns neutral when the president's party is not in the race", () => {
    expect(buildPresidentialModifierByParty({ partyId: "9", approval: 75 }, inRace).size).toBe(0);
  });

  it("50% approval → neutral 1.0x", () => {
    expect(
      buildPresidentialModifierByParty({ partyId: "2", approval: 50 }, inRace).get("2")
    ).toBeCloseTo(1.0);
  });

  it("75% approval → +9% ceiling", () => {
    expect(
      buildPresidentialModifierByParty({ partyId: "2", approval: 75 }, inRace).get("2")
    ).toBeCloseTo(1.09);
  });

  it("25% approval → -9% drag", () => {
    expect(
      buildPresidentialModifierByParty({ partyId: "2", approval: 25 }, inRace).get("2")
    ).toBeCloseTo(0.91);
  });
});

describe("presidentialModifierToPct", () => {
  it("converts the multiplier map to signed percentage tilts", () => {
    expect(presidentialModifierToPct(new Map([["2", 1.09]]))["2"]).toBeCloseTo(9, 5);
  });
});
