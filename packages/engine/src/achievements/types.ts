/**
 * Achievement catalog entry. Ports the display fields of
 * src/lib/db/types/achievement.ts Achievement (slug/name/description/icon/
 * category/order) verbatim from src/lib/seeds/achievements.ts ACHIEVEMENT_SEED.
 *
 * `status`/`blockingSystem` follow the same PORT-STUB pattern as
 * actions/catalog.ts and legislation/catalog.ts: an "unavailable" entry is
 * still listed (so a UI can show the full mainline catalog and gray out what
 * solo cannot grant yet) but achievements/evaluate.ts never checks it.
 */
export type AchievementCategory = "special" | "action" | "election" | "legislation" | "social" | "milestone";

export interface AchievementCatalogEntry {
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  order: number;
  status: "available" | "unavailable";
  /** When unavailable, the unported system blocking a real trigger. */
  blockingSystem?: string;
}
