import type { SeedPack } from "./types.js";

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function parseIsoDay(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  // Verify round-trip (reject 1953-02-31 etc)
  if (d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

/**
 * Validate a seed pack. Throws with a descriptive message on the first hard error.
 * Checks: packVersion, era id/label/startDate, countries table, duplicate ids,
 * at least one playable, economy numbers finite, gdp > 0, rates finite.
 * No IO, no randomness.
 */
export function validatePack(pack: SeedPack): void {
  if (typeof pack !== "object" || pack === null) {
    throw new Error("validatePack: pack must be an object");
  }

  // packVersion
  if (!isFiniteNumber(pack.packVersion) || !Number.isInteger(pack.packVersion) || pack.packVersion < 1) {
    throw new Error(`validatePack: packVersion must be a finite integer >= 1, got ${String(pack.packVersion)}`);
  }

  // era
  if (typeof pack.era !== "object" || pack.era === null) {
    throw new Error("validatePack: era must be an object");
  }
  const era = pack.era;
  if (typeof era.id !== "string" || era.id.trim() === "") {
    throw new Error("validatePack: era.id must be a non-empty string");
  }
  if (typeof era.label !== "string" || era.label.trim() === "") {
    throw new Error("validatePack: era.label must be a non-empty string");
  }
  if (typeof era.startDate !== "string" || parseIsoDay(era.startDate) === null) {
    throw new Error(`validatePack: era.startDate must be a valid ISO day YYYY-MM-DD, got ${String(era.startDate)}`);
  }

  // countries
  if (!Array.isArray(pack.countries)) {
    throw new Error("validatePack: countries must be an array");
  }
  if (pack.countries.length === 0) {
    throw new Error("validatePack: countries must not be empty");
  }

  const seen = new Set<string>();
  let playableCount = 0;

  for (let i = 0; i < pack.countries.length; i++) {
    const c = pack.countries[i] as unknown as Record<string, unknown>;
    if (typeof c !== "object" || c === null) {
      throw new Error(`validatePack: countries[${i}] must be an object`);
    }
    const id = c["id"];
    const name = c["name"];
    const playable = c["playable"];
    const economy = c["economy"] as unknown as Record<string, unknown> | undefined;

    if (typeof id !== "string" || id.trim() === "") {
      throw new Error(`validatePack: countries[${i}].id must be a non-empty string`);
    }
    if (seen.has(id)) {
      throw new Error(`validatePack: duplicate country id "${id}"`);
    }
    seen.add(id);

    if (typeof name !== "string" || name.trim() === "") {
      throw new Error(`validatePack: countries[${i}].name must be a non-empty string for id "${id}"`);
    }
    if (typeof playable !== "boolean") {
      throw new Error(`validatePack: countries[${i}].playable must be a boolean for id "${id}"`);
    }
    if (playable) playableCount++;

    if (typeof economy !== "object" || economy === null) {
      throw new Error(`validatePack: countries[${i}].economy must be an object for id "${id}"`);
    }

    const gdp = economy["gdp"];
    const growthRate = economy["growthRate"];
    const inflationRate = economy["inflationRate"];
    const unemploymentRate = economy["unemploymentRate"];

    if (!isFiniteNumber(gdp) || (gdp as number) <= 0) {
      throw new Error(`validatePack: countries[${i}].economy.gdp must be a finite number > 0 for id "${id}", got ${String(gdp)}`);
    }
    if (!isFiniteNumber(growthRate)) {
      throw new Error(`validatePack: countries[${i}].economy.growthRate must be a finite number for id "${id}", got ${String(growthRate)}`);
    }
    if (!isFiniteNumber(inflationRate)) {
      throw new Error(`validatePack: countries[${i}].economy.inflationRate must be a finite number for id "${id}", got ${String(inflationRate)}`);
    }
    if (!isFiniteNumber(unemploymentRate)) {
      throw new Error(`validatePack: countries[${i}].economy.unemploymentRate must be a finite number for id "${id}", got ${String(unemploymentRate)}`);
    }
    // unemployment is a rate 0..1, but allow 0 inclusive; negative is invalid.
    if ((unemploymentRate as number) < 0 || (unemploymentRate as number) > 1) {
      throw new Error(`validatePack: countries[${i}].economy.unemploymentRate must be in [0,1] for id "${id}", got ${String(unemploymentRate)}`);
    }
  }

  if (playableCount === 0) {
    throw new Error("validatePack: at least one playable country is required");
  }

  // optional extension tables: if present, must be arrays
  for (const key of ["states", "parties", "sectors"] as const) {
    const v = (pack as unknown as Record<string, unknown>)[key];
    if (v !== undefined && !Array.isArray(v)) {
      throw new Error(`validatePack: ${key} must be an array if present`);
    }
  }
}
