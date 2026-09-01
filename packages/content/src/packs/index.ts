import type { SeedPack } from "../types.js";
import { pack1953 } from "./1953.js";
import { pack1960 } from "./1960.js";

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
