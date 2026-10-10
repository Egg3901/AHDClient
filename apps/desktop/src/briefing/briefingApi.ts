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
    /** Absent on servers before the widget figures. */
    nationalInfluence?: number | null;
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
    marketCap?: number | null;
    history?: { turn: number; sharePrice: number; marketingStrength: number; liquidCapital: number; marketCap?: number | null }[];
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
  /** Present when the server supports the widget extras. */
  turn?: { current: number; date?: string | null; nextAt?: string | null; active: boolean } | null;
  inbox?: { unread: number; mail: number } | null;
  /** Per-turn change of each figure; null means unknown. */
  perTurn?: {
    funds: number | null;
    politicalInfluence: number | null;
    nationalInfluence: number | null;
    favorability: number | null;
    voteShare: number | null;
    sharePrice: number | null;
    marketCap: number | null;
    liquidCapital: number | null;
  } | null;
}
export type TurnChange = NonNullable<Snapshot["turnBriefing"]>[number];

export const briefing = {
  read: () => invoke<Snapshot>("get_briefing"),
  open: (section: Section | "inbox") => invoke<void>("open_briefing_page", { section }),
  /** A same-origin game path; Rust refuses anything else. */
  openPage: (path: string) => invoke<void>("open_game_page", { path }),
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
/** "Next turn in 23m", or why there is no countdown. */
export function nextTurn(turn: Snapshot["turn"], now: number): string | null {
  if (!turn) return null;
  if (!turn.active) return "Turns paused";
  const at = turn.nextAt ? Date.parse(turn.nextAt) : NaN;
  if (!Number.isFinite(at)) return null;
  const minutes = Math.ceil((at - now) / 60_000);
  if (minutes <= 0) return "Next turn running";
  if (minutes < 60) return `Next turn in ${minutes}m`;
  const rest = minutes % 60;
  return `Next turn in ${Math.floor(minutes / 60)}h${rest ? ` ${rest}m` : ""}`;
}
/** A turn change's current value in its own unit. */
export function changeValue(item: TurnChange, currency: string | null): string {
  return item.unit === "currency" ? money(item.value, currency)
    : item.unit === "percent" ? percent(item.value) : number(item.value);
}
/** A signed turn change. Vote share moves in percentage points. */
export function changeDelta(item: TurnChange, currency: string | null): string {
  const sign = item.delta > 0 ? "+" : "";
  return item.unit === "currency" ? `${sign}${money(item.delta, currency)}`
    : item.unit === "percent" ? `${sign}${number(item.delta)} pp` : `${sign}${number(item.delta)}`;
}
