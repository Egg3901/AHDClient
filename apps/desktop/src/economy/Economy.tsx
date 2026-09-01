import { useMemo, useState } from "react";
import type { WorldState, Party } from "@rotunda/engine";
import { Sparkline } from "./Sparkline.js";
import type { HistoryMap } from "./history.js";
import { getHistory } from "./history.js";
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
  history,
  onBack,
}: {
  world: WorldState;
  history: HistoryMap;
  onBack: () => void;
}) {
  const playerCountryId = safeStr(world.player?.countryId, Object.keys(world.countries ?? {})[0] ?? "US");
  const countries = world.countries as Record<string, unknown> | undefined;
  const playerRaw = (countries?.[playerCountryId] ?? null) as Record<string, unknown> | null;
  const playerEcon = (playerRaw?.economy ?? {}) as Record<string, unknown>;
  const playerName = safeStr(playerRaw?.name, playerCountryId);

  const turn = safeNum(world.meta?.turn, 0);
  const date = safeStr(world.meta?.date, "");

  // Player history series
  const playerHistory = getHistory(history, playerCountryId);
  const gdpSeries = playerHistory.map((p) => p.gdp);
  const growthSeries = playerHistory.map((p) => p.growthRate * 100);
  const inflationSeries = playerHistory.map((p) => p.inflationRate * 100);
  const unemploymentSeries = playerHistory.map((p) => p.unemploymentRate * 100);
  const outputGapSeries = playerHistory.map((p) => p.outputGap);

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

  const sparkCards = [
    { label: "GDP ($M)", values: gdpSeries, display: formatGdp(playerEcon["gdp"]), stroke: "#f5d76e", fill: "rgba(245,215,110,0.10)" },
    { label: "Growth", values: growthSeries, display: formatPct(playerEcon["growthRate"]), stroke: "#2af57f", fill: "rgba(42,245,127,0.10)" },
    { label: "Inflation", values: inflationSeries, display: formatPct(playerEcon["inflationRate"]), stroke: "#ff8a8a", fill: "rgba(255,138,138,0.10)" },
    { label: "Unemployment", values: unemploymentSeries, display: formatPct(playerEcon["unemploymentRate"]), stroke: "#a8d5ff", fill: "rgba(168,213,255,0.10)" },
    { label: "Output gap", values: outputGapSeries, display: formatOutputGap(playerEcon["outputGap"]), stroke: "#d5b8ff", fill: "rgba(213,184,255,0.10)" },
  ];

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
            <span className="muted small eco-history-note">
              {playerHistory.length} {playerHistory.length === 1 ? "turn" : "turns"} in session
            </span>
          </div>
          <div className="muted small eco-history-note" style={{ marginBottom: 12 }}>
            Session history only. Tracking starts when this session starts. Engine-side WorldHistory arrives in W41. Cap 520 turns.
          </div>
          <div className="eco-spark-grid">
            {sparkCards.map((card) => {
              const vals = card.values;
              const min = vals.length ? Math.min(...vals) : 0;
              const max = vals.length ? Math.max(...vals) : 0;
              const isPct = card.label !== "GDP ($M)";
              const rangeLabel =
                vals.length < 2
                  ? "—"
                  : isPct
                    ? `${min.toFixed(1)} to ${max.toFixed(1)}${card.label === "Output gap" ? "%" : "%"}`
                    : `${Math.round(min).toLocaleString("en-US")} to ${Math.round(max).toLocaleString("en-US")}`;
              return (
                <div key={card.label} className="eco-spark-card">
                  <div className="eco-spark-head">
                    <span className="eco-spark-label">{card.label}</span>
                    <span className="eco-spark-value">{card.display}</span>
                  </div>
                  <Sparkline values={vals} stroke={card.stroke} fill={card.fill} />
                  <div className="eco-spark-range">
                    <span>{vals.length < 2 ? "collecting" : rangeLabel}</span>
                    <span>{vals.length} pts</span>
                  </div>
                </div>
              );
            })}
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
