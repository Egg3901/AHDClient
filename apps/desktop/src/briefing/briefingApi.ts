import { invoke } from "@tauri-apps/api/core";

export const SECTIONS = ["profile", "election", "corporation", "stocks", "turns"] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_LABELS: Record<Section, string> = {
  profile: "Profile", election: "Election", corporation: "Corporation", stocks: "Stocks", turns: "Turns",
};
export interface Snapshot {
  status: "ready" | "signed-out" | "no-character";
  updatedAt: number;
  profile: null | {
    name: string;
    avatarUrl?: string | null;
    actions: number | null;
    actionCap: number | null;
    funds: number | null;
    personalHomeLiquid: number | null;
    homeCurrency: string | null;
    politicalInfluence: number | null;
    favorability: number | null;
    isImperial: boolean;
  };
  election: null | {
    electionId: string;
    electionType?: string | null;
    countryId?: string | null;
    state?: string | null;
    status?: string | null;
    electionYear?: number | null;
    endTurn?: number | null;
    myVotePct: number | null;
    marginPct: number | null;
    seatsProjected: number | null;
    totalSeats: number | null;
    isMultiSeat: boolean;
    history?: { turn: number; pct: number; seats: number | null }[];
  };
  corporation: null | {
    name: string;
    logoUrl?: string | null;
    tickerSymbol?: string | null;
    sequentialId: number;
    sharePrice: number | null;
    priceChange1h: number | null;
    liquidCapital: number | null;
    liquidCurrencyCode: string | null;
    marketingStrength: number | null;
    history?: { turn: number; sharePrice: number; marketingStrength: number; liquidCapital: number }[];
  };
  turnBriefing?: {
    category: string;
    label: string;
    value: number;
    delta: number;
    unit: "currency" | "points" | "percent";
    href: string;
  }[];
  marketWatch?: {
    sequentialId: number;
    name: string;
    logoUrl?: string | null;
    tickerSymbol?: string | null;
    sharePrice: number | null;
    liquidCurrencyCode: string | null;
    ownedShares: number;
  }[];
}

export const briefing = {
  read: () => invoke<Snapshot>("get_briefing"),
  open: (section: Section) => invoke<void>("open_briefing_page", { section }),
  popOut: () => invoke<void>("open_briefing_window"),
  pin: (pinned: boolean) => invoke<void>("set_briefing_pinned", { pinned }),
};

export function readSection(): Section {
  try {
    const saved = localStorage.getItem("ahdclient.briefing.section");
    return SECTIONS.find((s) => s === saved) ?? "profile";
  } catch { return "profile"; }
}
export function saveSection(section: Section): void {
  try { localStorage.setItem("ahdclient.briefing.section", section); } catch { /* Optional preference. */ }
}
export function nextSection(section: Section, direction: number): Section {
  return SECTIONS[(SECTIONS.indexOf(section) + direction + SECTIONS.length) % SECTIONS.length]!;
}
export function number(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? "Unavailable"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: digits, notation: "compact" }).format(value);
}
export function money(value: number | null | undefined, currency: string | null): string {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  // Never guess a currency when the server omits it.
  return `${number(value)}${currency ? ` ${currency}` : ""}`;
}
export function percent(value: number | null | undefined, signed = false, unit = "%"): string {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return `${signed && value > 0 ? "+" : ""}${number(value)}${unit}`;
}
export function freshness(updatedAt: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - updatedAt) / 60_000));
  if (minutes === 0) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes}m ago`;
  return `Updated ${Math.floor(minutes / 60)}h ago`;
}
