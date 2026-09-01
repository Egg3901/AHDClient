import type { NewsItem } from "@rotunda/engine";

export type NewsCategory = string;

const PREFIX_RE = /^\s*\[([^\]]+)\]\s*/;

const KNOWN_CATEGORIES = new Set(["general", "era", "cheat"]);

// Normalize a raw category string: lowercase, trim, collapse spaces, fallback
function normalizeCategory(raw: string): string {
  const c = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!c) return "general";
  // keep single token: spaces become hyphen
  return c.replace(/\s+/g, "-");
}

/**
 * Infer category for a news headline.
 * Priority:
 * 1. Headline prefix like "[Economy] ..." where engine provides it
 * 2. Known engine sources explicitly:
 *    - era transitions: headlines containing "new era begins"
 *    - cheat injections: not distinguishable from content alone, but we
 *      treat untagged arbitrary headlines as general which covers cheats.
 *      The "cheat" category is still used when prefix [cheat] is present.
 * 3. Fallback "general"
 */
export function categorizeNews(item: Pick<NewsItem, "headline"> | null | undefined): string {
  if (!item || typeof item.headline !== "string") return "general";
  const headline = item.headline;
  const m = headline.match(PREFIX_RE);
  if (m && m[1]) {
    const cat = normalizeCategory(m[1]!);
    if (cat) return cat;
  }
  const lower = headline.toLowerCase();
  if (lower.includes("new era begins")) return "era";
  if (lower.includes("new game begins")) return "general";
  // Explicit cheat detection via prefix already handled; no content marker for cheat
  // Fall back
  return "general";
}

/**
 * Strip the leading "[Category]" prefix for display, if present.
 */
export function stripPrefix(headline: string): string {
  if (typeof headline !== "string") return "";
  const m = headline.match(PREFIX_RE);
  if (m) return headline.slice(m[0].length);
  return headline;
}

/**
 * Collect distinct categories present in a news list, always including
 * "general" and known explicit categories if they appear.
 * Defensive for null/legacy.
 */
export function collectCategories(items: readonly Pick<NewsItem, "headline">[] | null | undefined): string[] {
  if (!Array.isArray(items) || items.length === 0) return ["general"];
  const set = new Set<string>();
  for (const item of items) {
    if (!item || typeof (item as NewsItem).headline !== "string") continue;
    set.add(categorizeNews(item as NewsItem));
  }
  if (set.size === 0) set.add("general");
  // Ensure general always present for filter stability
  if (!set.has("general")) set.add("general");
  // Sort with general first, then era, then alphabetical
  const priority = (c: string): number => {
    if (c === "general") return 0;
    if (c === "era") return 1;
    if (c === "cheat") return 2;
    return 10;
  };
  return [...set].sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}

export function isKnownCategory(cat: string): boolean {
  return KNOWN_CATEGORIES.has(cat);
}
