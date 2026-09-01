import { describe, expect, it } from "vitest";
import { PACKS, pack1953 } from "./packs/index.js";
import { validatePack } from "./validate.js";
import type { SeedPack } from "./types.js";

describe("validatePack", () => {
  it("accepts every shipped pack", () => {
    for (const pack of PACKS) {
      expect(() => validatePack(pack)).not.toThrow();
    }
  });

  it("rejects duplicate country ids", () => {
    const dup: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    dup.countries.push({ ...dup.countries[0]! });
    expect(() => validatePack(dup)).toThrow(/duplicate/i);
  });

  it("rejects no playable countries", () => {
    const noPlay: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    for (const c of noPlay.countries) c.playable = false;
    expect(() => validatePack(noPlay)).toThrow(/playable/i);
  });

  it("rejects bad dates", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    bad.era.startDate = "1953-13-01";
    expect(() => validatePack(bad)).toThrow(/date/i);
    const bad2 = structuredClone(PACKS[0]!) as SeedPack;
    bad2.era.startDate = "not-a-date";
    expect(() => validatePack(bad2)).toThrow(/date/i);
  });

  it("rejects non-finite numbers", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    bad.countries[0]!.economy.gdp = Infinity;
    expect(() => validatePack(bad)).toThrow(/gdp/i);
    const bad2 = structuredClone(PACKS[0]!) as SeedPack;
    bad2.countries[0]!.economy.growthRate = NaN;
    expect(() => validatePack(bad2)).toThrow(/growthRate/i);
  });

  it("rejects invalid packVersion", () => {
    const bad = structuredClone(PACKS[0]!) as SeedPack;
    (bad as unknown as Record<string, unknown>)["packVersion"] = 0;
    expect(() => validatePack(bad)).toThrow(/packVersion/i);
  });

  it("1953 pack has 27 countries and expected ids exist", () => {
    expect(pack1953.countries.length).toBe(27);
    const ids = new Set(pack1953.countries.map((c) => c.id));
    expect(ids.has("US")).toBe(true);
    expect(ids.has("UK")).toBe(true);
    expect(ids.has("RU")).toBe(true);
    // eastern bloc satellites
    expect(ids.has("PL")).toBe(true);
    expect(ids.has("BAL")).toBe(true);
  });

  it("1953 pack has parties for all playable countries", () => {
    const playable = new Set(pack1953.countries.filter((c) => c.playable).map((c) => c.id));
    const partyCountries = new Set((pack1953.parties ?? []).map((p) => p.countryId));
    for (const id of playable) expect(partyCountries.has(id)).toBe(true);
  });

  it("1960 pack parties match 1953 party count and ids (no invented 1960 roster)", async () => {
    const { pack1960 } = await import("./packs/index.js");
    expect(pack1960.parties?.length).toBe(pack1953.parties?.length);
    const ids53 = new Set(pack1953.parties!.map((p) => p.id));
    const ids60 = new Set(pack1960.parties!.map((p) => p.id));
    expect(ids60).toEqual(ids53);
  });

  it("every chamber composition sums to chamber seats", () => {
    for (const pack of PACKS) {
      for (const leg of pack.legislatures ?? []) {
        for (const ch of leg.chambers) {
          const sum = Object.values(ch.composition.seatsByParty).reduce((a, b) => a + b, 0) + ch.composition.vacancies;
          expect(sum, `${pack.era.id} ${leg.countryId} ${ch.key} sum ${sum} vs seats ${ch.seats}`).toBe(ch.seats);
        }
      }
    }
  });

  it("every party ref in legislature compositions resolves and matches legislature country", () => {
    for (const pack of PACKS) {
      const partyMap = new Map((pack.parties ?? []).map((p) => [p.id, p]));
      for (const leg of pack.legislatures ?? []) {
        for (const ch of leg.chambers) {
          for (const pid of Object.keys(ch.composition.seatsByParty)) {
            expect(partyMap.has(pid), `${pack.era.id} ${leg.countryId} ${ch.key} party ${pid} missing`).toBe(true);
            expect(partyMap.get(pid)!.countryId).toBe(leg.countryId);
          }
        }
      }
    }
  });

  it("rejects duplicate party ids", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    bad.parties!.push({ ...bad.parties![0]! });
    expect(() => validatePack(bad)).toThrow(/duplicate party/i);
  });

  it("rejects party with invalid country ref", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    bad.parties!.push({ id: "FAKE_X", name: "Fake", countryId: "ZZ", abbreviation: "FAK", color: "#000", economicPosition: 0, socialPosition: 0 });
    expect(() => validatePack(bad)).toThrow(/countryId.*ZZ/i);
  });

  it("rejects seatsByParty unknown party ref", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    const leg = bad.legislatures!.find((l) => l.countryId === "US")!;
    leg.chambers[0]!.composition.seatsByParty["FAKE_PARTY"] = 1;
    // adjust vacancies to keep sum valid so the unknown party error fires first
    leg.chambers[0]!.composition.vacancies -= 1;
    expect(() => validatePack(bad)).toThrow(/unknown party/i);
  });

  it("rejects composition sum mismatch", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    const leg = bad.legislatures!.find((l) => l.countryId === "US")!;
    leg.chambers[0]!.composition.vacancies += 1;
    expect(() => validatePack(bad)).toThrow(/composition sum/i);
  });

  it("rejects duplicate chamber keys", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    const leg = bad.legislatures!.find((l) => l.countryId === "US")!;
    leg.chambers.push({ ...leg.chambers[0]! });
    expect(() => validatePack(bad)).toThrow(/duplicate chamber key/i);
  });

  it("playable countries have legislature entries with expected chambers and elected flags", () => {
    const usLeg = pack1953.legislatures!.find((l) => l.countryId === "US")!;
    expect(usLeg.bicameral).toBe(true);
    expect(usLeg.chambers.some((c) => c.key === "senate" && c.elected === true)).toBe(true);
    expect(usLeg.chambers.some((c) => c.key === "house" && c.elected === true)).toBe(true);
    const ukLeg = pack1953.legislatures!.find((l) => l.countryId === "UK")!;
    expect(ukLeg.bicameral).toBe(false);
    expect(ukLeg.chambers.find((c) => c.key === "lords")!.elected).toBe(false);
    expect(ukLeg.chambers.find((c) => c.key === "commons")!.elected).toBe(true);
    const ddLeg = pack1953.legislatures!.find((l) => l.countryId === "DD")!;
    expect(ddLeg.chambers.find((c) => c.key === "staatsrat")!.elected).toBe(false);
    expect(ddLeg.chambers.find((c) => c.key === "volkskammer")!.elected).toBe(true);
    const ruLeg = pack1953.legislatures!.find((l) => l.countryId === "RU")!;
    expect(ruLeg.bicameral).toBe(true);
    expect(ruLeg.chambers.find((c) => c.key === "sovietOfNationalities")!.seats).toBe(515);
    expect(ruLeg.chambers.find((c) => c.key === "sovietOfTheUnion")!.seats).toBe(526);
  });

  it("party economic/social positions are within [-5,5] and match engine axis system", () => {
    for (const pack of PACKS) {
      for (const p of pack.parties ?? []) {
        expect(p.economicPosition).toBeGreaterThanOrEqual(-5);
        expect(p.economicPosition).toBeLessThanOrEqual(5);
        expect(p.socialPosition).toBeGreaterThanOrEqual(-5);
        expect(p.socialPosition).toBeLessThanOrEqual(5);
      }
    }
  });

  it("1953 pack has 80 states (48 US +12 UK +14 RU +6 DD), AK/HI absent", () => {
    expect(pack1953.states!.length).toBe(80);
    expect(pack1953.states!.filter((s) => s.countryId === "US").length).toBe(48);
    expect(pack1953.states!.filter((s) => s.countryId === "UK").length).toBe(12);
    expect(pack1953.states!.filter((s) => s.countryId === "RU").length).toBe(14);
    expect(pack1953.states!.filter((s) => s.countryId === "DD").length).toBe(6);
    const ids = new Set(pack1953.states!.map((s) => s.id));
    expect(ids.has("AK")).toBe(false);
    expect(ids.has("HI")).toBe(false);
    expect(ids.has("DC")).toBe(false);
    expect(ids.has("CA")).toBe(true);
    expect(ids.has("NY")).toBe(true);
    expect(ids.has("TX")).toBe(true);
    expect(ids.has("LON")).toBe(true);
    expect(ids.has("CEN")).toBe(true);
    expect(ids.has("BEO")).toBe(true);
    expect(ids.size).toBe(80);
  });

  it("1953 US states houseSeats sum to 435 (83rd Congress apportionment)", () => {
    const total = pack1953.states!.filter((s) => s.countryId === "US").reduce((a, s) => a + s.houseSeats, 0);
    expect(total).toBe(435);
  });

  it("1953 US states population sums plausible vs mainline total (149,895,183 from 1950 Census)", () => {
    const totalUS = pack1953.states!.filter((s) => s.countryId === "US").reduce((a, s) => a + s.population, 0);
    expect(totalUS).toBe(149_895_183);
    const totalUK = pack1953.states!.filter((s) => s.countryId === "UK").reduce((a, s) => a + s.population, 0);
    expect(totalUK).toBe(52600000);
    const totalRU = pack1953.states!.filter((s) => s.countryId === "RU").reduce((a, s) => a + s.population, 0);
    expect(totalRU).toBe(148500000);
    const totalDD = pack1953.states!.filter((s) => s.countryId === "DD").reduce((a, s) => a + s.population, 0);
    expect(totalDD).toBe(18400000);
  });

  it("1953 US states have senateClasses I/II/III and gdp/region Registration modeled", () => {
    for (const st of pack1953.states!) {
      expect(st.senateClasses.length).toBe(2);
      for (const c of st.senateClasses) expect([1, 2, 3]).toContain(c);
      expect(st.gdp).toBeGreaterThan(0);
      expect(st.region).not.toBe("");
      expect(st.registration.parties.length).toBeGreaterThan(0);
      // disenfranchisement modeled as unregistered pool — Southern states have large pools
      if (st.id === "MS") expect(st.registration.unregistered).toBe(25);
      if (st.id === "AL") expect(st.registration.unregistered).toBe(22);
    }
  });

  it("state legislatures: stateSenate chamber is vacant with citation (no invented 1953 composition)", () => {
    const usLeg = pack1953.legislatures!.find((l) => l.countryId === "US")!;
    const stateSenate = usLeg.chambers.find((c) => c.key === "stateSenate")!;
    // 1972 is the 50-state total (STATE_SENATE_SEATS sum). 1953 pack has 48 contiguous states
    // (AK 20 + HI 25 absent; plus NY 61 vs modern 63 delta). Per-state sum for 1953 is 1925.
    // No mainline 1953 composition exists, so it stays vacant. Source: historicalSeats.ts has no US_STATE_SENATE_1953 roster; only US_HOUSE/SENATE/GOVERNOR for 1953.
    expect(stateSenate.seats).toBe(1972);
    expect(stateSenate.composition.vacancies).toBe(1972);
    expect(Object.keys(stateSenate.composition.seatsByParty).length).toBe(0);
    // Sum of per-state senateSeats for 1953 US 48 states is 1925
    const sum = pack1953.states!.filter((s) => s.countryId === "US").reduce((a, s) => a + s.senateSeats, 0);
    expect(sum).toBe(1925);
  });

  it("pack validation extended: rejects duplicate state ids and bad houseSeats sum", () => {
    const bad: SeedPack = structuredClone(pack1953) as SeedPack;
    bad.states!.push({ ...bad.states![0]! });
    expect(() => validatePack(bad)).toThrow(/duplicate state/i);
    const bad2: SeedPack = structuredClone(pack1953) as SeedPack;
    bad2.states![0]!.houseSeats += 1;
    expect(() => validatePack(bad2)).toThrow(/houseSeats sum/i);
  });

  it("W39: UK 12, RU 14, DD 6 houseSeats sum to mainline totals (625, 526, 500) and gdp/population plausible", () => {
    const ukSum = pack1953.states!.filter((s) => s.countryId === "UK").reduce((a, s) => a + s.houseSeats, 0);
    expect(ukSum).toBe(625);
    const ruSum = pack1953.states!.filter((s) => s.countryId === "RU").reduce((a, s) => a + s.houseSeats, 0);
    expect(ruSum).toBe(526);
    const ddSum = pack1953.states!.filter((s) => s.countryId === "DD").reduce((a, s) => a + s.houseSeats, 0);
    expect(ddSum).toBe(500);
    // gdp positive and region field present for all W39 subdivisions
    for (const st of pack1953.states!.filter((s) => ["UK", "RU", "DD"].includes(s.countryId))) {
      expect(st.gdp).toBeGreaterThan(0);
      expect(st.region).not.toBe("");
    }
  });

  it("W39: UK/RU/DD registration anchors reflect mainline polling/org tables (no invented numbers)", () => {
    // UK NIR SF 30, CON 63; SCO SNP 0 but present; RU CEN CPSU 98; DD BEO SED 66
    const nir = pack1953.states!.find((s) => s.id === "NIR")!;
    expect(nir.registration.parties.find((p) => p.abbr === "SF")!.reg).toBe(30);
    expect(nir.registration.parties.find((p) => p.abbr === "CON")!.reg).toBe(63);
    const sco = pack1953.states!.find((s) => s.id === "SCO")!;
    expect(sco.registration.parties.find((p) => p.abbr === "SNP")!.reg).toBe(0);
    const cen = pack1953.states!.find((s) => s.id === "CEN")!;
    expect(cen.registration.parties.find((p) => p.abbr === "CPSU")!.reg).toBe(98);
    const beo = pack1953.states!.find((s) => s.id === "BEO")!;
    expect(beo.registration.parties.find((p) => p.abbr === "SED")!.reg).toBe(66);
  });
});
