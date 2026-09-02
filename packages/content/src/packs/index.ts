import type { SeedPack } from "../types.js";
import { pack1953 } from "./1953.js";
import { pack1979 } from "./1979.js";
import { pack1991 } from "./1991.js";
import { pack2019 } from "./2019.js";
export { US_STATE_DEMOGRAPHICS_1953 } from "./usStateDemographics1953.js";
export { UK_DEMOGRAPHICS_1953 } from "./ukDemographics1953.js";
export { RU_DEMOGRAPHICS_1953 } from "./ruDemographics1953.js";
export { DD_DEMOGRAPHICS_1953 } from "./ddDemographics1953.js";
export type { StateDemographicsSeed } from "./usStateDemographics1953.js";
export { ukRegions1953 } from "./ukRegions1953.js";
export { ruRegions1953 } from "./ruRegions1953.js";
export { ddRegions1953 } from "./ddRegions1953.js";

export { pack1953 } from "./1953.js";
export { pack1979 } from "./1979.js";
export { pack1991 } from "./1991.js";
export { pack2019 } from "./2019.js";

/**
 * The four real mainline era presets (1953-default / 1979-default /
 * 1991-default / 2019-default — see packages/content/scripts/generatePacks.ts
 * and the per-pack provenance headers for citations). The fabricated
 * "1960" pack (invented era, interpolation-derived numbers) has been
 * deleted; see docs/briefs for the removal writeup. A "1960"-era SAVE FILE
 * can still be loaded — packages/engine/src/calendar.ts keeps a legacy
 * date anchor for it so old saves migrate and advance correctly — but no
 * new world can be created in it, because no pack exists for it.
 */
export const PACKS: SeedPack[] = [pack1953, pack1979, pack1991, pack2019];

// Sorted by startDate ascending for era ladder use
export const PACKS_BY_DATE: SeedPack[] = [...PACKS].sort((a, b) =>
  a.era.startDate.localeCompare(b.era.startDate),
);

const PACK_BY_ERA = new Map<string, SeedPack>(PACKS.map((p) => [p.era.id, p]));

export function getPackByEra(era: string): SeedPack | undefined {
  return PACK_BY_ERA.get(era);
}
