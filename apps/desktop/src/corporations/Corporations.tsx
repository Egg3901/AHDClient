import { useMemo, useState } from "react";
import type { WorldState } from "@rotunda/engine";
import "./corporations.css";

// Defensive helpers — pre-v19 saves have no corporations map; pre-v26 no
// sharePrice fields. Same convention as markets/Markets.tsx and every other
// screen in this app: read WorldState defensively via Record<string, unknown>
// so an older save never crashes the UI, only shows less.
function safeNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function safeStr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
function safeBool(v: unknown): boolean {
  return v === true;
}
function formatPrice(v: unknown): string {
  const n = safeNum(v, 0);
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatCash(v: unknown): string {
  const n = safeNum(v, 0);
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function sectorLabel(s: string): string {
  return s.replace(/_/g, " ");
}

const ARCHETYPE_LABEL: Record<string, string> = {
  aggressive: "Aggressive",
  cautious: "Cautious",
  innovator: "Innovator",
  costCutter: "Cost cutter",
};
const ARCHETYPE_NOTE: Record<string, string> = {
  aggressive: "High ambition, low stubbornness — pushes growth hard, less resistant to brake pressure.",
  innovator: "High ambition, high stubbornness — pushes growth hard and holds the target under pressure.",
  costCutter: "Low ambition, high stubbornness — favors margin discipline over growth, holds its line.",
  cautious: "Low ambition, low stubbornness — conservative growth targets, quick to back off.",
};

type CorpRow = {
  id: string;
  countryId: string;
  ticker: string;
  sector: string;
  revenue: number;
  liquidCapital: number;
  sharePrice: number;
  archetype: string;
  ambition: number;
  stubbornness: number;
  targetGrowthRate: number;
  currentGrowthRate: number;
  profitMargin: number;
  effectiveProfitMargin: number;
  insolventSinceTurn: number | null;
  reincorporationCount: number;
  foundedAtTurn: number;
  foundingRevenue: number;
  earningsHistory: number[];
  totalShares: number;
  publicFloat: number;
  shareholders: Array<{ holder: string; shares: number; avgCostPerShare: number | undefined }>;
  bankCharter: unknown | null;
};

function Sparkline({ values, width = 120, height = 32 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span className="muted small">not enough history</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} className="corps-spark" aria-hidden>
      <polyline fill="none" stroke="#8a8a8a" strokeWidth={1.4} points={points} />
    </svg>
  );
}

export function CorporationsScreen({
  world,
  onBack,
}: {
  world: WorldState;
  onBack: () => void;
}) {
  const meta = (world as unknown as Record<string, unknown>)["meta"] as Record<string, unknown> | undefined;
  const turn = safeNum(meta?.["turn"], 0);
  const date = safeStr(meta?.["date"], "");
  const player = (world as unknown as Record<string, unknown>)["player"] as Record<string, unknown> | undefined;
  const countries = (world.countries as Record<string, unknown> | undefined) ?? {};
  const playerCountryId = safeStr(player?.["countryId"], Object.keys(countries)[0] ?? "US");
  const playerCountryName = safeStr((countries[playerCountryId] as Record<string, unknown> | undefined)?.["name"], playerCountryId);

  const corporationsRaw = (world as unknown as Record<string, unknown>)["corporations"] as Record<string, unknown> | undefined;
  const isPreV19 = !corporationsRaw || typeof corporationsRaw !== "object";

  const snapshotsRaw = (world as unknown as Record<string, unknown>)["corpRevenueSnapshots"] as Record<string, unknown> | undefined;

  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const corpsForCountry: CorpRow[] = useMemo(() => {
    if (!corporationsRaw || typeof corporationsRaw !== "object") return [];
    const out: CorpRow[] = [];
    for (const raw of Object.values(corporationsRaw)) {
      const c = raw as Record<string, unknown>;
      if (safeStr(c["countryId"], "") !== playerCountryId) continue;
      const personality = (c["personality"] as Record<string, unknown> | undefined) ?? {};
      const shareholdersRaw = Array.isArray(c["shareholders"]) ? (c["shareholders"] as Array<Record<string, unknown>>) : [];
      const earningsHistory = Array.isArray(c["earningsHistory"]) ? (c["earningsHistory"] as number[]).filter((n) => Number.isFinite(n)) : [];
      out.push({
        id: safeStr(c["id"], ""),
        countryId: playerCountryId,
        ticker: safeStr(c["tickerSymbol"], safeStr(c["id"], "")),
        sector: safeStr(c["sectorType"], ""),
        revenue: safeNum(c["revenue"], 0),
        liquidCapital: safeNum(c["liquidCapital"], 0),
        sharePrice: safeNum(c["sharePrice"], 0),
        archetype: safeStr(c["archetype"], "unknown"),
        ambition: safeNum(personality["ambition"], 0),
        stubbornness: safeNum(personality["stubbornness"], 0),
        targetGrowthRate: safeNum(c["targetGrowthRate"], 0),
        currentGrowthRate: safeNum(c["currentGrowthRate"], 0),
        profitMargin: safeNum(c["profitMargin"], 0),
        effectiveProfitMargin: safeNum(c["effectiveProfitMargin"], safeNum(c["profitMargin"], 0)),
        insolventSinceTurn:
          typeof c["insolventSinceTurn"] === "number" && Number.isFinite(c["insolventSinceTurn"] as number)
            ? (c["insolventSinceTurn"] as number)
            : null,
        reincorporationCount: safeNum(c["reincorporationCount"], 0),
        foundedAtTurn: safeNum(c["foundedAtTurn"], 0),
        foundingRevenue: safeNum(c["foundingRevenue"], 0),
        earningsHistory,
        totalShares: safeNum(c["totalShares"], 0),
        publicFloat: safeNum(c["publicFloat"], 0),
        shareholders: shareholdersRaw.map((s) => ({
          holder: safeStr(s["holder"], "npc"),
          shares: safeNum(s["shares"], 0),
          avgCostPerShare: typeof s["avgCostPerShare"] === "number" && Number.isFinite(s["avgCostPerShare"] as number) ? (s["avgCostPerShare"] as number) : undefined,
        })),
        bankCharter: (c["bankCharter"] as unknown) ?? null,
      });
    }
    out.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return out;
  }, [corporationsRaw, playerCountryId]);

  const sectorsPresent = useMemo(() => {
    const set = new Set<string>();
    for (const c of corpsForCountry) if (c.sector) set.add(c.sector);
    return [...set].sort();
  }, [corpsForCountry]);

  const filtered = useMemo(
    () => (sectorFilter === "all" ? corpsForCountry : corpsForCountry.filter((c) => c.sector === sectorFilter)),
    [corpsForCountry, sectorFilter],
  );

  const selected = useMemo(() => corpsForCountry.find((c) => c.id === selectedId) ?? null, [corpsForCountry, selectedId]);
  const countrySnapshot = selected ? (snapshotsRaw?.[selected.countryId] as Record<string, unknown> | undefined) : undefined;

  return (
    <div className="corps-screen">
      <header className="corps-header">
        <div className="row spread">
          <div className="row" style={{ gap: 12 }}>
            <h1 className="corps-title">CORPORATIONS</h1>
            <span className="muted small corps-subtitle">
              {playerCountryName} ({playerCountryId}) · Turn {turn}
              {date ? ` · ${date}` : ""}
            </span>
          </div>
          <button className="secondary small-btn" onClick={onBack}>
            Back to dashboard
          </button>
        </div>
        <div className="corps-controls">
          <label className="muted small corps-filter-label">
            Sector
            <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}>
              <option value="all">all sectors</option>
              {sectorsPresent.map((s) => (
                <option key={s} value={s}>
                  {sectorLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <span className="muted small corps-note">{filtered.length} corporation(s) · share trading lives on the MARKETS screen</span>
        </div>
      </header>

      <div className="corps-layout">
        {isPreV19 && (
          <div className="panel corps-empty">
            <p className="muted small">No corporations on this save. This world was created before the corporations system. Advance a turn or load a newer save to seed the roster.</p>
            <p className="muted small">Backing: WorldState.corporations — defensive read, no crash on missing.</p>
          </div>
        )}

        {!isPreV19 && (
          <section className="panel corps-section">
            <div className="row spread" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>Roster</h2>
              <span className="muted small corps-note">Click a row to inspect financial history, shareholders and insolvency state.</span>
            </div>
            {filtered.length === 0 ? (
              <p className="muted small">No corporations for this filter.</p>
            ) : (
              <div className="corps-table-wrap">
                <table className="corps-table">
                  <thead>
                    <tr>
                      <th>Corp</th>
                      <th>Sector</th>
                      <th>Revenue</th>
                      <th>Liquid capital</th>
                      <th>Share price</th>
                      <th>CEO archetype</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((corp) => {
                      const isBank = corp.bankCharter !== null && typeof corp.bankCharter === "object";
                      const isSelected = corp.id === selectedId;
                      return (
                        <tr
                          key={corp.id}
                          className={`corps-row ${corp.insolventSinceTurn !== null ? "is-insolvent" : ""} ${isSelected ? "is-selected" : ""}`}
                          onClick={() => setSelectedId(isSelected ? null : corp.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") setSelectedId(isSelected ? null : corp.id);
                          }}
                        >
                          <td className="corps-corp-cell">
                            <span className="corps-ticker">{corp.ticker}</span>
                            <span className="muted small corps-corp-id">{corp.id}</span>
                          </td>
                          <td className="muted small" style={{ textTransform: "capitalize" }}>{sectorLabel(corp.sector)}</td>
                          <td className="corps-num">${formatCash(corp.revenue)}</td>
                          <td className="corps-num">${formatCash(corp.liquidCapital)}</td>
                          <td className="corps-num">${formatPrice(corp.sharePrice)}</td>
                          <td>
                            <span className="corps-badge archetype">{ARCHETYPE_LABEL[corp.archetype] ?? corp.archetype}</span>
                          </td>
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
                              {isBank && <span className="corps-badge bank">bank charter</span>}
                              {corp.insolventSinceTurn !== null ? (
                                <span className="corps-badge insolvent">insolvent T{corp.insolventSinceTurn}</span>
                              ) : (
                                <span className="corps-badge solvent">solvent</span>
                              )}
                              {corp.reincorporationCount > 0 && <span className="muted small" style={{ fontSize: 10 }}>reincorp ×{corp.reincorporationCount}</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {selected && (
          <section className="panel corps-detail">
            <div className="row spread" style={{ marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>
                {selected.ticker} <span className="muted small">{selected.id}</span>
              </h2>
              <button className="secondary small-btn" onClick={() => setSelectedId(null)}>
                Close
              </button>
            </div>

            <div className="corps-detail-grid">
              <div className="corps-detail-card">
                <h3>CEO</h3>
                <div className="corps-detail-row">
                  <span>Archetype</span>
                  <span className="corps-badge archetype">{ARCHETYPE_LABEL[selected.archetype] ?? selected.archetype}</span>
                </div>
                <p className="muted small" style={{ marginTop: 4 }}>{ARCHETYPE_NOTE[selected.archetype] ?? "Archetype derived deterministically from ambition/stubbornness."}</p>
                <div className="corps-detail-row">
                  <span>Ambition</span>
                  <span>{selected.ambition.toFixed(0)}</span>
                </div>
                <div className="corps-detail-row">
                  <span>Stubbornness</span>
                  <span>{selected.stubbornness.toFixed(0)}</span>
                </div>
                <div className="corps-detail-row">
                  <span>Growth target / current</span>
                  <span>{selected.targetGrowthRate.toFixed(1)}% / {selected.currentGrowthRate.toFixed(1)}%</span>
                </div>
                <div className="corps-detail-row">
                  <span>Margin base / effective</span>
                  <span>{selected.profitMargin.toFixed(1)}% / {selected.effectiveProfitMargin.toFixed(1)}%</span>
                </div>
              </div>

              <div className="corps-detail-card">
                <h3>Financial history</h3>
                <p className="muted small">Rolling annualized after-tax net income, oldest first (corp.earningsHistory).</p>
                <Sparkline values={selected.earningsHistory} />
                <div className="muted small" style={{ marginTop: 6 }}>
                  {selected.earningsHistory.length} turn(s) tracked
                  {selected.earningsHistory.length > 0 && (
                    <> · latest ${formatCash(selected.earningsHistory[selected.earningsHistory.length - 1] ?? 0)}</>
                  )}
                </div>
                <div style={{ marginTop: 10 }}>
                  <span className="muted small">
                    Founded T{selected.foundedAtTurn} at ${formatCash(selected.foundingRevenue)}/turn founding revenue (dissolution anchor).
                  </span>
                </div>
                {countrySnapshot ? (
                  <div style={{ marginTop: 10, borderTop: "1px solid #1a1a1a", paddingTop: 8 }}>
                    <span className="muted small">
                      Country aggregate ({selected.countryId}, all corps — engine has no per-corp revenue snapshot, only this
                      country-level total): current ${formatCash(safeNum(countrySnapshot["current"], 0))} vs previous $
                      {formatCash(safeNum(countrySnapshot["previous"], 0))} (T{safeNum(countrySnapshot["turn"], 0)}).
                    </span>
                  </div>
                ) : (
                  <div style={{ marginTop: 10 }}>
                    <span className="muted small">No country-level revenue snapshot on this save yet.</span>
                  </div>
                )}
              </div>

              <div className="corps-detail-card">
                <h3>Shareholders</h3>
                {selected.shareholders.length === 0 ? (
                  <p className="muted small">No shareholder records.</p>
                ) : (
                  <table className="corps-shareholder-table">
                    <thead>
                      <tr>
                        <th>Holder</th>
                        <th>Shares</th>
                        <th>% of total</th>
                        <th>Avg cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.shareholders.map((s, i) => (
                        <tr key={`${s.holder}-${i}`}>
                          <td>{s.holder === "player" ? "You" : "NPC founder"}</td>
                          <td className="corps-num">{formatCash(s.shares)}</td>
                          <td className="corps-num">{selected.totalShares > 0 ? `${((s.shares / selected.totalShares) * 100).toFixed(1)}%` : "—"}</td>
                          <td className="corps-num">{s.avgCostPerShare !== undefined ? `$${formatPrice(s.avgCostPerShare)}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="muted small" style={{ marginTop: 8 }}>
                  Public float (unowned, buyable from treasury): {formatCash(selected.publicFloat)} of {formatCash(selected.totalShares)} total shares.
                </div>
              </div>

              <div className="corps-detail-card">
                <h3>Insolvency state</h3>
                {selected.insolventSinceTurn !== null ? (
                  <>
                    <span className="corps-badge insolvent">insolvent since T{selected.insolventSinceTurn}</span>
                    <p className="muted small" style={{ marginTop: 6 }}>
                      Liquid capital ${formatCash(selected.liquidCapital)}. Reincorporated {selected.reincorporationCount} time(s) after prior insolvency.
                    </p>
                  </>
                ) : (
                  <>
                    <span className="corps-badge solvent">solvent</span>
                    <p className="muted small" style={{ marginTop: 6 }}>
                      Liquid capital ${formatCash(selected.liquidCapital)}
                      {selected.liquidCapital < 1_000_000 ? " — thin reserves, watch this one." : "."}
                      {selected.reincorporationCount > 0 && ` Reincorporated ${selected.reincorporationCount} time(s) historically.`}
                    </p>
                  </>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
