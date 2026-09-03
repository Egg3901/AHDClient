import { useMemo, useState } from "react";
import type { WorldState, Party } from "@ahdclient/engine";
import { HistoryChart } from "./HistoryChart.js";
import type { HistoryChartSeries } from "./HistoryChart.js";
import { HISTORY_RANGES, macroSeries, primeRateSeries, partyStrengthSeries, playerWealthSeries } from "./history.js";
import type { HistoryRange } from "./history.js";
import "./economy.css";

type SortKey = "name" | "gdp" | "growthRate" | "inflationRate" | "unemploymentRate" | "outputGap";
type SortDir = "asc" | "desc";

function safeNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function safeStr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function formatPct(rate: unknown): string {
  const n = safeNum(rate, 0);
  return `${(n * 100).toFixed(1)}%`;
}

function formatGdp(v: unknown): string {
  const n = safeNum(v, 0);
  return Math.round(n).toLocaleString("en-US");
}

function formatOutputGap(v: unknown): string {
  const n = safeNum(v, 0);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function formatTreasury(v: unknown): string {
  const n = safeNum(v, 0);
  return n.toLocaleString("en-US");
}

export function EconomyScreen({
  world,
  onBack,
}: {
  world: WorldState;
  onBack: () => void;
}) {
  const playerCountryId = safeStr(world.player?.countryId, Object.keys(world.countries ?? {})[0] ?? "US");
  const countries = world.countries as Record<string, unknown> | undefined;
  const playerRaw = (countries?.[playerCountryId] ?? null) as Record<string, unknown> | null;
  const playerEcon = (playerRaw?.economy ?? {}) as Record<string, unknown>;
  const playerName = safeStr(playerRaw?.name, playerCountryId);

  const turn = safeNum(world.meta?.turn, 0);
  const date = safeStr(world.meta?.date, "");

  // U12: engine-side WorldHistory (W41), range-selectable 1y/5y/all.
  const [range, setRange] = useState<HistoryRange>("all");
  const playerMacroHistory = useMemo(() => macroSeries(world, playerCountryId, range), [world, playerCountryId, range]);

  // Parties of player country, defensive
  const partiesRaw = world.parties as Record<string, unknown> | undefined;
  const playerParties: Party[] = useMemo(() => {
    if (!partiesRaw || typeof partiesRaw !== "object") return [];
    const out: Party[] = [];
    for (const p of Object.values(partiesRaw)) {
      const party = p as Record<string, unknown>;
      if (safeStr(party["countryId"], "") !== playerCountryId) continue;
      out.push(p as Party);
    }
    out.sort((a, b) => {
      const ta = safeNum((a as unknown as Record<string, unknown>)["treasury"], 0);
      const tb = safeNum((b as unknown as Record<string, unknown>)["treasury"], 0);
      return tb - ta;
    });
    return out;
  }, [partiesRaw, playerCountryId]);

  // Macro history chart series (single-series each, per-metric card).
  const macroCharts: Array<{ id: string; label: string; color: string; valueFormat: (v: number) => string; points: Array<{ turn: number; value: number }> }> = [
    { id: "gdp", label: "GDP ($M)", color: "#f5d76e", valueFormat: (v) => `$${Math.round(v).toLocaleString("en-US")}M`, points: playerMacroHistory.map((p) => ({ turn: p.turn, value: p.gdp })) },
    { id: "growth", label: "Growth", color: "#2af57f", valueFormat: (v) => `${v.toFixed(1)}%`, points: playerMacroHistory.map((p) => ({ turn: p.turn, value: p.growthRate * 100 })) },
    { id: "inflation", label: "Inflation", color: "#ff8a8a", valueFormat: (v) => `${v.toFixed(1)}%`, points: playerMacroHistory.map((p) => ({ turn: p.turn, value: p.inflationRate * 100 })) },
    { id: "unemployment", label: "Unemployment", color: "#a8d5ff", valueFormat: (v) => `${v.toFixed(1)}%`, points: playerMacroHistory.map((p) => ({ turn: p.turn, value: p.unemploymentRate * 100 })) },
    { id: "outputGap", label: "Output gap", color: "#d5b8ff", valueFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`, points: playerMacroHistory.map((p) => ({ turn: p.turn, value: p.outputGap })) },
  ];

  // Prime rate history (player country's central bank).
  const primeRateHistory = useMemo(() => primeRateSeries(world, playerCountryId, range), [world, playerCountryId, range]);
  const primeRateChartSeries: HistoryChartSeries[] = [
    { id: playerCountryId, label: "Prime rate", color: "#5ec9ff", points: primeRateHistory.map((p) => ({ turn: p.turn, value: p.primeRate })) },
  ];

  // Party strength history — one line per party of the player's country, colored by Party.color.
  const partyStrengthChartSeries: HistoryChartSeries[] = playerParties.map((party) => {
    const p = party as unknown as Record<string, unknown>;
    const id = safeStr(p["id"], "");
    const points = partyStrengthSeries(world, id, range).map((pt) => ({ turn: pt.turn, value: pt.politicalStrength }));
    return { id, label: safeStr(p["abbreviation"], id), color: safeStr(p["color"], "#e8e8ee"), points };
  });

  // Player net worth history.
  const playerWealthHistory = useMemo(() => playerWealthSeries(world, range), [world, range]);
  const netWorthChartSeries: HistoryChartSeries[] = [
    { id: "netWorth", label: "Net worth", color: "#f5d76e", points: playerWealthHistory.map((p) => ({ turn: p.turn, value: p.netWorth })) },
  ];
  const rangeLabels: Record<HistoryRange, string> = { "1y": "1Y", "5y": "5Y", all: "ALL" };

  // All countries rows defensive
  const rows = useMemo(() => {
    if (!countries) return [] as Array<{ id: string; name: string; gdp: number; growthRate: number; inflationRate: number; unemploymentRate: number; outputGap: number }>;
    return Object.values(countries).map((raw) => {
      const c = raw as Record<string, unknown>;
      const econ = (c.economy ?? {}) as Record<string, unknown>;
      return {
        id: safeStr(c["id"], ""),
        name: safeStr(c["name"], safeStr(c["id"], "")),
        gdp: safeNum(econ["gdp"], 0),
        growthRate: safeNum(econ["growthRate"], 0),
        inflationRate: safeNum(econ["inflationRate"], 0),
        unemploymentRate: safeNum(econ["unemploymentRate"], 0),
        outputGap: safeNum(econ["outputGap"], 0),
      };
    });
  }, [countries]);

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  return (
    <div className="eco-screen">
      <header className="eco-header">
        <div className="row spread">
          <div className="row" style={{ gap: 12 }}>
            <h1 className="eco-title">ECONOMY</h1>
            <span className="muted small eco-subtitle">
              {playerName} ({playerCountryId}) · Turn {turn}
              {date ? ` · ${date}` : ""}
            </span>
          </div>
          <button className="secondary small-btn" onClick={onBack}>
            Back to dashboard
          </button>
        </div>
      </header>

      <div className="eco-layout">
        <section className="panel eco-section">
          <h2>{playerName} — current</h2>
          <div className="eco-strip">
            <div className="eco-tile">
              <span className="eco-tile-label">GDP</span>
              <span className="eco-tile-value">${formatGdp(playerEcon["gdp"])}M</span>
              <span className="eco-tile-sub">Nominal, $M</span>
            </div>
            <div className="eco-tile">
              <span className="eco-tile-label">Growth</span>
              <span className="eco-tile-value">{formatPct(playerEcon["growthRate"])}</span>
              <span className="eco-tile-sub">Annualized</span>
            </div>
            <div className="eco-tile">
              <span className="eco-tile-label">Inflation</span>
              <span className="eco-tile-value">{formatPct(playerEcon["inflationRate"])}</span>
              <span className="eco-tile-sub">Annualized</span>
            </div>
            <div className="eco-tile">
              <span className="eco-tile-label">Unemployment</span>
              <span className="eco-tile-value">{formatPct(playerEcon["unemploymentRate"])}</span>
              <span className="eco-tile-sub">Share of workforce</span>
            </div>
            <div className="eco-tile">
              <span className="eco-tile-label">Output gap</span>
              <span className="eco-tile-value">{formatOutputGap(playerEcon["outputGap"])}</span>
              <span className="eco-tile-sub">Cyclical deviation</span>
            </div>
          </div>
        </section>

        <section className="panel eco-section">
          <div className="row spread" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>History · {playerName}</h2>
            <div className="hist-range-select" role="group" aria-label="History range">
              {HISTORY_RANGES.map((r) => (
                <button
                  key={r}
                  className={`hist-range-btn${range === r ? " active" : ""}`}
                  onClick={() => setRange(r)}
                  type="button"
                >
                  {rangeLabels[r]}
                </button>
              ))}
            </div>
          </div>
          <div className="muted small eco-history-note" style={{ marginBottom: 12 }}>
            Engine-side WorldHistory (W41) — persists across save/load, up to 520 turns (10 game years).
          </div>

          <div className="eco-spark-grid">
            {macroCharts.map((card) => {
              const last = card.points[card.points.length - 1];
              return (
                <div key={card.id} className="eco-spark-card">
                  <div className="eco-spark-head">
                    <span className="eco-spark-label">{card.label}</span>
                    <span className="eco-spark-value">{last ? card.valueFormat(last.value) : "—"}</span>
                  </div>
                  <HistoryChart
                    series={[{ id: card.id, label: card.label, color: card.color, points: card.points }]}
                    height={90}
                    valueFormat={card.valueFormat}
                  />
                  <div className="eco-spark-range">
                    <span>{card.points.length < 2 ? "collecting" : `${card.points.length} pts`}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hist-chart-row">
            <div className="hist-chart-block">
              <h3 className="hist-chart-title">Prime rate · {playerCountryId}</h3>
              <HistoryChart series={primeRateChartSeries} height={140} valueFormat={(v) => `${v.toFixed(2)}%`} />
            </div>
            <div className="hist-chart-block">
              <h3 className="hist-chart-title">Party strength · {playerCountryId}</h3>
              <HistoryChart
                series={partyStrengthChartSeries}
                height={140}
                valueFormat={(v) => v.toLocaleString("en-US")}
                emptyLabel="no parties to chart"
              />
            </div>
            <div className="hist-chart-block">
              <h3 className="hist-chart-title">Net worth · {playerName}</h3>
              <HistoryChart
                series={netWorthChartSeries}
                height={140}
                valueFormat={(v) => `$${Math.round(v).toLocaleString("en-US")}`}
              />
            </div>
          </div>
        </section>

        <div className="eco-bottom-grid">
          <section className="panel eco-section">
            <h2>All countries</h2>
            <div className="eco-table-wrap">
              <table className="eco-table">
                <thead>
                  <tr>
                    <th>
                      <button className="eco-sort" onClick={() => toggleSort("name")}>
                        Country{sortIndicator("name")}
                      </button>
                    </th>
                    <th>
                      <button className="eco-sort" onClick={() => toggleSort("gdp")}>
                        GDP ($M){sortIndicator("gdp")}
                      </button>
                    </th>
                    <th>
                      <button className="eco-sort" onClick={() => toggleSort("growthRate")}>
                        Growth{sortIndicator("growthRate")}
                      </button>
                    </th>
                    <th>
                      <button className="eco-sort" onClick={() => toggleSort("inflationRate")}>
                        Inflation{sortIndicator("inflationRate")}
                      </button>
                    </th>
                    <th>
                      <button className="eco-sort" onClick={() => toggleSort("unemploymentRate")}>
                        Unemployment{sortIndicator("unemploymentRate")}
                      </button>
                    </th>
                    <th>
                      <button className="eco-sort" onClick={() => toggleSort("outputGap")}>
                        Output gap{sortIndicator("outputGap")}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id} className={r.id === playerCountryId ? "is-player" : undefined}>
                      <td>
                        {r.name}
                        {r.id === playerCountryId && <span className="muted small" style={{ marginLeft: 6 }}>you</span>}
                      </td>
                      <td>{formatGdp(r.gdp)}</td>
                      <td>{formatPct(r.growthRate)}</td>
                      <td>{formatPct(r.inflationRate)}</td>
                      <td>{formatPct(r.unemploymentRate)}</td>
                      <td>{formatOutputGap(r.outputGap)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel eco-section">
            <h2>Party treasuries · {playerName}</h2>
            {playerParties.length === 0 ? (
              <p className="muted small">No parties for this country.</p>
            ) : (
              <ul className="eco-treasury-list">
                {playerParties.map((party) => {
                  const p = party as unknown as Record<string, unknown>;
                  const tier = safeStr(p["tier"], "minor") as "major" | "minor";
                  const treasury = safeNum(p["treasury"], 0);
                  const ps = safeNum(p["politicalStrength"], 0);
                  const org = safeNum(p["organization"], 0);
                  const abbrev = safeStr(p["abbreviation"], safeStr(p["id"], ""));
                  return (
                    <li key={safeStr(p["id"], abbrev)} className="eco-treasury-item">
                      <div className="eco-treasury-head">
                        <span className="eco-treasury-name">
                          {safeStr(p["name"], abbrev)} <span className="muted small">({abbrev})</span>
                        </span>
                        <span className={`eco-badge ${tier}`}>{tier}</span>
                      </div>
                      <div className="eco-treasury-stats">
                        <span className="eco-stat">
                          <span className="eco-stat-label">Treasury</span>
                          <span className="eco-stat-value">${formatTreasury(treasury)}</span>
                        </span>
                        <span className="eco-stat">
                          <span className="eco-stat-label">Strength</span>
                          <span className="eco-stat-value">{ps.toLocaleString("en-US")}</span>
                        </span>
                        <span className="eco-stat">
                          <span className="eco-stat-label">Organization</span>
                          <span className="eco-stat-value">{org.toFixed(0)}</span>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="muted small" style={{ marginTop: 12, lineHeight: 1.4 }}>
              Tier badge: major and minor cap political strength. Treasury, strength and organization are per-party reserves.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
