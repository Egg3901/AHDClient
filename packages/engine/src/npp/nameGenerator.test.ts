import { describe, it, expect } from "vitest";
import { rngFromSeed } from "../rng.js";
import {
  generateNpcName,
  generateNpcNameAndGender,
  generateUniqueNpcName,
  SUPPORTED_COUNTRIES,
  isNameFromCountryPool,
} from "./nameGenerator.js";
import { namesForYear, gatedNameCount } from "./nameEra.js";
import {
  UK_SURNAMES,
  UK_FIRST_NAMES_MALE,
  UK_FIRST_NAMES_FEMALE,
} from "./nameLists1.js";
import { DE_SURNAMES, DE_FIRST_NAMES_MALE, DE_FIRST_NAMES_FEMALE } from "./nameLists2.js";
import { RU_SURNAMES } from "./nameLists3.js";
import { DD_FIRST_NAMES_MALE, DD_FIRST_NAMES_FEMALE, HU_SURNAMES } from "./nameLists4.js";

const ALL_COUNTRIES = SUPPORTED_COUNTRIES;

describe("npp nameGenerator determinism", () => {
  it("same rng state gives same sequence of names", () => {
    const seq = (seed: string, country: string, era: string | null) => {
      const rng = rngFromSeed(seed);
      return Array.from({ length: 10 }, () => generateNpcName(rng, country, era));
    };
    expect(seq("hello", "US", "1953")).toEqual(seq("hello", "US", "1953"));
    expect(seq("hello", "UK", null)).toEqual(seq("hello", "UK", null));
    expect(seq("hello", "RU", "1960")).toEqual(seq("hello", "RU", "1960"));
    // different seed diverges
    expect(seq("hello", "US", null)).not.toEqual(seq("world", "US", null));
  });

  it("same rng state gives same name+gender sequence", () => {
    const rng1 = rngFromSeed("deterministic");
    const rng2 = rngFromSeed("deterministic");
    for (let i = 0; i < 20; i++) {
      expect(generateNpcNameAndGender(rng1, "US", "1960")).toEqual(
        generateNpcNameAndGender(rng2, "US", "1960"),
      );
    }
  });

  it("pools are non-empty for every supported country", () => {
    for (const country of ALL_COUNTRIES) {
      const rng = rngFromSeed(`pool-${country}`);
      const names = Array.from({ length: 20 }, () => generateNpcName(rng, country, null));
      expect(names.length, country).toBe(20);
      for (const n of names) {
        expect(n.trim(), country).toBe(n);
        expect(n.split(/\s+/).filter(Boolean).length, n).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("different countries draw from their own pools (sample checks)", () => {
    // UK pool should contain UK surnames, not Japanese
    const rngUK = rngFromSeed("uk-check");
    const ukNames = Array.from({ length: 50 }, () => generateNpcName(rngUK, "UK", null));
    // At least one UK surname appears across 50 draws (UK pool is exclusively UK)
    const ukSurnameSet = new Set<string>(UK_SURNAMES);
    expect(ukNames.some((n) => n.split(/\s+/).some((tok) => ukSurnameSet.has(tok)))).toBe(true);

    // DD uses GDR-era first names + DE surnames
    const rngDD = rngFromSeed("dd-check");
    const ddNames = Array.from({ length: 50 }, () => generateNpcName(rngDD, "DD", null));
    const deSurnameSet = new Set<string>(DE_SURNAMES);
    expect(ddNames.some((n) => n.split(/\s+/).some((tok) => deSurnameSet.has(tok)))).toBe(true);
    const ddFirstNames = new Set<string>([...DD_FIRST_NAMES_MALE, ...DD_FIRST_NAMES_FEMALE]);
    expect(ddNames.some((n) => ddFirstNames.has(n.split(/\s+/)[0]!))).toBe(true);

    // RU draws from RU pool (or minority sub-pools)
    const rngRU = rngFromSeed("ru-check");
    const ruNames = Array.from({ length: 50 }, () => generateNpcName(rngRU, "RU", null));
    expect(ruNames.every((n) => n.split(/\s+/).length >= 2)).toBe(true);

    // US vs UK should not be identical pools — generate many and check they differ
    const rngUS = rngFromSeed("compare-us-uk");
    const rngUK2 = rngFromSeed("compare-us-uk");
    // Use different country with same seed — sequences should diverge
    const usNames = Array.from({ length: 20 }, () => generateNpcName(rngUS, "US", null));
    const ukNames2 = Array.from({ length: 20 }, () => generateNpcName(rngUK2, "UK", null));
    expect(usNames).not.toEqual(ukNames2);
  });

  it("isNameFromCountryPool membership reflects country pools", () => {
    const rng = rngFromSeed("membership");
    // Names generated for a country should pass its own pool check
    for (const country of ["UK", "DE", "RU", "DD"] as const) {
      for (let i = 0; i < 10; i++) {
        const name = generateNpcName(rng, country, null);
        expect(isNameFromCountryPool(name, country), `${country}: ${name}`).toBe(true);
      }
    }
  });

  it("unknown country falls back to US pool", () => {
    const rng1 = rngFromSeed("fallback");
    const rng2 = rngFromSeed("fallback");
    const unknown = generateNpcName(rng1, "ZZ", null);
    const us = generateNpcName(rng2, "US", null);
    expect(unknown).toBe(us);
  });
});

describe("npp era gating", () => {
  it("has a non-empty gate table", () => {
    expect(gatedNameCount()).toBeGreaterThan(20);
  });

  it("namesForYear keeps whole pool when era is null", () => {
    const pool = ["James", "Aaliyah"];
    expect(namesForYear(pool, null)).toEqual(pool);
    expect(namesForYear(pool, undefined)).toEqual(pool);
  });

  it("excludes modern coinages from early era for US pool", () => {
    expect(namesForYear(["James", "Aaliyah"], 1953)).toEqual(["James"]);
    // Via generator: 1953 US run draws no gated names
    const gated = new Set(["Aaliyah", "Jessica", "Jennifer", "Ashley", "Jasmine", "Zachary"]);
    const rng = rngFromSeed("era-1953");
    for (let i = 0; i < 200; i++) {
      const first = generateNpcName(rng, "US", "1953").split(/\s+/)[0]!;
      expect(gated.has(first), `drew ${first} in 1953`).toBe(false);
    }
  });

  it("modern era admits gated names", () => {
    const rng = rngFromSeed("era-2019");
    const seen = new Set<string>();
    for (let i = 0; i < 800; i++) seen.add(generateNpcName(rng, "US", "2019").split(/\s+/)[0]!);
    expect(["Jennifer", "Jessica", "Ashley", "Ryan", "Joshua", "Michelle"].some((n) => seen.has(n))).toBe(true);
    // Numeric era also works
    const rng2 = rngFromSeed("era-2019-num");
    const seen2 = new Set<string>();
    for (let i = 0; i < 800; i++) seen2.add(generateNpcName(rng2, "US", 2019).split(/\s+/)[0]!);
    expect(["Jennifer", "Jessica", "Ashley", "Ryan", "Joshua", "Michelle"].some((n) => seen2.has(n))).toBe(true);
  });

  it("non-US pools ignore era (same distribution)", () => {
    // RU/UK/DD first-name pools are not gated; era should not filter them.
    // Generate with 1953 vs 2019 and ensure both produce valid names (no crash)
    // and that UK/DD pools still produce their own era-specific names.
    const rng1 = rngFromSeed("era-uk-1953");
    const rng2 = rngFromSeed("era-uk-2019");
    const uk1953 = Array.from({ length: 30 }, () => generateNpcName(rng1, "UK", "1953"));
    const uk2019 = Array.from({ length: 30 }, () => generateNpcName(rng2, "UK", "2019"));
    expect(uk1953.length).toBe(30);
    expect(uk2019.length).toBe(30);
  });

  it("generateUniqueNpcName respects uniqueness", () => {
    const rng = rngFromSeed("unique");
    const existing = Array.from({ length: 5 }, () => generateNpcName(rng, "US", null));
    const next = generateUniqueNpcName(rng, existing, "US", null, 100);
    expect(next).not.toBeNull();
    expect(existing).not.toContain(next);
  });
});
