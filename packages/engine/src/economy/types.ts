import type { CorporationType } from "../corporation/types.js";

/**
 * One unowned-sector revenue pool — solo analogue of mainline's UnownedSector
 * (src/lib/db/types/unownedSector.ts), collapsed to country granularity to
 * match W9's one-corp-per-(country,sector) model (no per-state corp sectors
 * — see unownedSectorGrowth.ts file doc). Keyed `${countryId}:${sectorType}`
 * in WorldState.unownedSectors.
 */
export interface UnownedSectorState {
  countryId: string;
  sectorType: CorporationType;
  /** Per-turn revenue (local currency, absolute units) — same unit as Corporation.revenue. */
  revenue: number;
}
