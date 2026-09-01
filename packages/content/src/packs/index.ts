import type { SeedPack } from "../types.js";
import { pack1953 } from "./1953.js";
import { pack1960 } from "./1960.js";
export { US_STATE_DEMOGRAPHICS_1953 } from "./usStateDemographics1953.js";
export { UK_DEMOGRAPHICS_1953 } from "./ukDemographics1953.js";
export { RU_DEMOGRAPHICS_1953 } from "./ruDemographics1953.js";
export { DD_DEMOGRAPHICS_1953 } from "./ddDemographics1953.js";
export type { StateDemographicsSeed } from "./usStateDemographics1953.js";
export { ukRegions1953 } from "./ukRegions1953.js";
export { ruRegions1953 } from "./ruRegions1953.js";
export { ddRegions1953 } from "./ddRegions1953.js";

export { pack1953 } from "./1953.js";
export { pack1960 } from "./1960.js";

export const PACKS: SeedPack[] = [pack1953, pack1960];

// Sorted by startDate ascending for era ladder use
export const PACKS_BY_DATE: SeedPack[] = [...PACKS].sort((a, b) =>
  a.era.startDate.localeCompare(b.era.startDate),
);

const PACK_BY_ERA = new Map<string, SeedPack>(PACKS.map((p) => [p.era.id, p]));

export function getPackByEra(era: string): SeedPack | undefined {
  return PACK_BY_ERA.get(era);
}
