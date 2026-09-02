import { describe, expect, it } from "vitest";
import { getCatalog, getAllLawIds, CATALOG } from "./catalog.js";

// W61 M2: the five post-Cold-War roster countries carry mainline's own
// legislation catalogs (generated, see catalogPorted*.ts headers).
describe("ported legislation catalogs (JP/DE/IE/CN/BR)", () => {
  it("every roster country has a catalog and ids are unique across the whole catalog", () => {
    const expected: Record<string, number> = { JP: 63, DE: 60, IE: 58, CN: 62, BR: 14 };
    for (const [cid, n] of Object.entries(expected)) {
      expect(getCatalog(cid).length, cid).toBe(n);
    }
    const ids = getAllLawIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(CATALOG.length).toBe(ids.length);
  });

  it("tax entries carry a coherent authored rate ladder", () => {
    for (const e of CATALOG.filter((x) => x.kind === "tax" && x.taxPolicy)) {
      const t = e.taxPolicy!;
      expect(t.minRate, e.id).toBeLessThanOrEqual(t.maxRate);
      expect(t.baselineRate, e.id).toBeGreaterThanOrEqual(t.minRate);
      expect(t.baselineRate, e.id).toBeLessThanOrEqual(t.maxRate);
      expect(t.step, e.id).toBeGreaterThan(0);
    }
  });

  it("generated entries are PORT-STUB with a named blocker; fully mapped ones keep their decay targets", () => {
    // Hand-ported US/UK/RU/DD entries may be available with no decay targets
    // (they act through taxPolicy / immediate effect); the generator's rule is
    // stricter and applies to the five generated catalogs only.
    for (const e of CATALOG.filter((x) => ["JP", "DE", "IE", "CN", "BR"].includes(x.countryId))) {
      expect(e.status, e.id).toBe("unavailable");
      expect(e.blockingSystem, e.id).toBeTruthy();
      if (e.blockingSystem === "legislation/effectDescriptor") expect(e.targets.length, e.id).toBeGreaterThan(0);
    }
  });
});
