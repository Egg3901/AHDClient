/**
 * Era gating for generated politician names.
 *
 * Source: /root/projects/AHDGame/src/lib/npp/nameEra.ts (verbatim port).
 * Only names that are demonstrably modern in American use are gated;
 * traditional names carry no entry and work in every era. See mainline
 * header for full rationale.
 */

/** Name -> earliest year it reads as plausible for an adult politician. */
const NAME_NOT_BEFORE: Record<string, number> = {
  Joshua: 1975,
  Jason: 1970,
  Ryan: 1975,
  Zachary: 1985,
  Ethan: 1995,
  Noah: 1995,
  Brandon: 1980,
  Tyler: 1990,
  DeShawn: 1975,
  Darnell: 1965,
  Jamal: 1970,
  Terrence: 1960,
  Jennifer: 1970,
  Jessica: 1980,
  Ashley: 1980,
  Kimberly: 1965,
  Michelle: 1965,
  Amanda: 1975,
  Melissa: 1965,
  Stephanie: 1965,
  Nicole: 1975,
  Samantha: 1975,
  Tamika: 1975,
  Keisha: 1975,
  Latoya: 1975,
  Ebony: 1975,
  Jasmine: 1985,
  Aaliyah: 1995,
  Imani: 1975,
};

/**
 * Names plausible for a world at `year`.
 * Null year (no era clock) keeps the whole pool. Never returns empty.
 */
export function namesForYear(pool: string[], year: number | null | undefined): string[] {
  if (year == null || !Number.isFinite(year)) return pool;
  const eligible = pool.filter((name) => {
    const notBefore = NAME_NOT_BEFORE[name];
    return notBefore == null || year >= notBefore;
  });
  return eligible.length > 0 ? eligible : pool;
}

/** Test seam — lets a test assert the table is non-empty without exporting it wholesale. */
export function gatedNameCount(): number {
  return Object.keys(NAME_NOT_BEFORE).length;
}
