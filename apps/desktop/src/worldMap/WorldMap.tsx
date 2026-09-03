import { useMemo, useState, useRef } from "react";
import type { WorldState, Party, Legislature } from "@ahdclient/engine";
import topoRaw from "../assets/countries-110m.json";
import { decodeTopology, ringsToPathD } from "./topo.js";
import { ISO_TO_COUNTRY } from "./idMap.js";
import "./worldMap.css";

type Metric = "gdp" | "growth" | "inflation" | "unemployment" | "outputGap";

const METRIC_OPTIONS: Array<{ value: Metric; label: string }> = [
  { value: "gdp", label: "GDP" },
  { value: "growth", label: "Growth" },
  { value: "inflation", label: "Inflation" },
  { value: "unemployment", label: "Unemployment" },
  { value: "outputGap", label: "Output gap" },
];

// Dark-theme sequential ramp: low -> high
const RAMP = ["#12201d", "#1e3a33", "#2a6b5a", "#5bc09e", "#c8ffe8"] as const;
const NEUTRAL = "#2e2e2e";
const NEUTRAL_STROKE = "#3a3a3a";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
function rampColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (RAMP.length - 1);
  const idx = Math.floor(scaled);
  const frac = scaled - idx;
  if (idx >= RAMP.length - 1) return RAMP[RAMP.length - 1]!;
  const a = hexToRgb(RAMP[idx]!);
  const b = hexToRgb(RAMP[idx + 1]!);
  return rgbToHex(a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac, a[2] + (b[2] - a[2]) * frac);
}

function metricValueFor(country: WorldState["countries"][string], metric: Metric): number {
  const e = country.economy;
  switch (metric) {
    case "gdp": return e.gdp;
    case "growth": return e.growthRate;
    case "inflation": return e.inflationRate;
    case "unemployment": return e.unemploymentRate;
    case "outputGap": return e.outputGap;
  }
}

function formatMetric(metric: Metric, value: number): string {
  if (metric === "gdp") return `$${Math.round(value).toLocaleString("en-US")}M`;
  if (metric === "outputGap") {
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatMetricShort(metric: Metric, value: number): string {
  return formatMetric(metric, value);
}

const VIEW_W = 960;
const VIEW_H = 480;

export function WorldMapScreen({ world, onBack }: { world: WorldState; onBack: () => void }) {
  const [metric, setMetric] = useState<Metric>("gdp");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ name: string; metricLabel: string; x: number; y: number } | null>(null);

  const decoded = useMemo(() => {
    const topo = topoRaw as unknown as Parameters<typeof decodeTopology>[0];
    const features = decodeTopology(topo);
    return features.map((f) => {
      const countryId = ISO_TO_COUNTRY[f.iso] ?? null;
      const pathD = ringsToPathD(f.rings, VIEW_W, VIEW_H);
      return { ...f, countryId, pathD };
    });
  }, []);

  const domain = useMemo(() => {
    const values = Object.values(world.countries).map((c) => metricValueFor(c as WorldState["countries"][string], metric));
    if (values.length === 0) return { min: 0, max: 1 };
    let min = values[0]!;
    let max = values[0]!;
    for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
    if (min === max) return { min: min - 1, max: max + 1 };
    return { min, max };
  }, [world.countries, metric]);

  const countryById = world.countries;
  const playerId = world.player.countryId;

  const selectedCountry = selectedId ? countryById[selectedId] ?? null : null;
  const selectedParties: Party[] = useMemo(() => {
    if (!selectedId) return [];
    return Object.values(world.parties).filter((p) => (p as Party).countryId === selectedId) as Party[];
  }, [world.parties, selectedId]);

  const selectedLegislature: Legislature | undefined = selectedId ? world.legislatures[selectedId] : undefined;

  // For map tint: countryId -> color
  const colorByCountry = useMemo(() => {
    const m = new Map<string, string>();
    const range = domain.max - domain.min;
    for (const [id, c] of Object.entries(countryById)) {
      const v = metricValueFor(c as WorldState["countries"][string], metric);
      const t = range === 0 ? 0.5 : (v - domain.min) / range;
      m.set(id, rampColor(t));
    }
    return m;
  }, [countryById, domain, metric]);

  const handleMove = (e: React.MouseEvent) => {
    if (hover) {
      setHover((h) => h ? { ...h, x: e.clientX, y: e.clientY } : null);
    }
  };

  return (
    <div className="world-screen">
      <header className="world-header">
        <div className="world-header-left">
          <h1 className="world-title">WORLD</h1>
          <span className="world-era">Turn {world.meta.turn} · {world.meta.date} · {world.meta.era}</span>
        </div>
        <div className="world-header-right">
          <select className="world-metric-select" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
            {METRIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button className="secondary small-btn" onClick={onBack}>Back</button>
        </div>
      </header>

      <div className="world-layout" onMouseMove={handleMove}>
        <div className="world-map-wrap">
          <div className="world-svg-card">
            <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label="World map" style={{ background: "#0f1413" }}>
              <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="#0f1413" />
              {decoded.map((feat, idx) => {
                const cid = feat.countryId;
                const isModeled = cid ? !!countryById[cid] : false;
                const fill = cid && isModeled ? (colorByCountry.get(cid) ?? NEUTRAL) : NEUTRAL;
                const isPlayer = cid === playerId;
                const isSelected = cid !== null && cid === selectedId;
                // For multi-iso countries (YU/CS/BAL), multiple features share same cid; outline player per feature.
                // DD has no geometry, so never matched.
                const key = `${feat.iso}-${idx}`;
                const countryName = cid ? (countryById[cid]?.name ?? feat.name) : feat.name;
                const metricLabel = cid && isModeled ? formatMetricShort(metric, metricValueFor(countryById[cid] as WorldState["countries"][string], metric)) : "—";
                return (
                  <path
                    key={key}
                    d={feat.pathD}
                    fill={fill}
                    className={`world-map-country ${isPlayer ? "is-player" : ""} ${isSelected ? "is-selected" : ""}`}
                    onMouseEnter={(e) => {
                      if (cid && isModeled) {
                        setHover({ name: countryName, metricLabel: `${METRIC_OPTIONS.find(m=>m.value===metric)?.label ?? metric}: ${metricLabel}`, x: e.clientX, y: e.clientY });
                      } else {
                        setHover({ name: feat.name, metricLabel: "Not modeled", x: e.clientX, y: e.clientY });
                      }
                    }}
                    onMouseMove={(e) => {
                      if (cid && isModeled) {
                        setHover({ name: countryName, metricLabel: `${METRIC_OPTIONS.find(m=>m.value===metric)?.label ?? metric}: ${metricLabel}`, x: e.clientX, y: e.clientY });
                      } else {
                        setHover({ name: feat.name, metricLabel: "Not modeled", x: e.clientX, y: e.clientY });
                      }
                    }}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => {
                      if (cid && isModeled) setSelectedId(cid);
                      else if (feat.name) {
                        // non-modeled click clears or keeps; allow clearing selection? no change
                        // keep current selection but could show neutral? Do nothing.
                      }
                    }}
                  />
                );
              })}
            </svg>
          </div>

          <div className="world-legend">
            <span style={{ color: "#e8e8ee", fontWeight: 600 }}>{METRIC_OPTIONS.find(m=>m.value===metric)?.label}</span>
            <div className="world-legend-bar" style={{ background: `linear-gradient(to right, ${RAMP.join(", ")})` }} />
            <div className="world-legend-minmax">
              <span>{formatMetricShort(metric, domain.min)}</span>
              <span style={{ color: "#3a3a3a" }}>→</span>
              <span>{formatMetricShort(metric, domain.max)}</span>
            </div>
            <div className="world-legend-neutral">
              <span className="world-legend-swatch" style={{ background: NEUTRAL }} />
              <span>Not modeled</span>
              <span className="world-legend-swatch" style={{ background: "transparent", borderColor: "#e8e8ee" }} />
              <span>Player</span>
            </div>
          </div>

          <div className="world-note">
            110m natural-earth-ish equirectangular. DE geometry tinted by DE economy. DD has no separate polygon on modern 110m (unified Germany); see DD entry below. CS maps to Czechia and Slovakia, BAL to three Baltic polygons, YU to six successor states. Antarctica (010) and small territories neutral.
          </div>

          <div className="world-country-picker" role="group" aria-label="Quick select modeled country">
            {Object.keys(countryById).sort().map((id) => {
              const c = countryById[id] as WorldState["countries"][string];
              const isActive = selectedId === id;
              return (
                <button
                  key={id}
                  className={`world-country-chip ${c.playable ? "playable" : ""} ${isActive ? "active" : ""}`}
                  onClick={() => setSelectedId(id)}
                  title={c.name}
                >
                  {id}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="world-side">
          {!selectedCountry ? (
            <div className="world-side-placeholder">
              <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#e8e8ee" }}>Select a country</p>
              <p className="small muted" style={{ margin: 0 }}>Hover for values, click a tinted country or chip to inspect economy, parties, and legislature.</p>
              <p className="small muted" style={{ marginTop: 12 }}>Player country {playerId} outlined.</p>
            </div>
          ) : (
            <>
              <div className="world-side-head">
                <div>
                  <h2 className="world-side-title">{selectedCountry.name}</h2>
                  <span className="small muted" style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>{selectedCountry.id}</span>
                  <div className="world-badges">
                    {selectedCountry.playable && <span className="world-badge playable">Playable</span>}
                    {selectedId === playerId && <span className="world-badge player">Your country</span>}
                    {selectedId === "DD" && <span className="world-badge dd-note">Shares DE polygon on modern map</span>}
                    {selectedId === "DE" && <span className="world-badge dd-note">DE covers former DD area</span>}
                    {selectedId === "CS" && <span className="world-badge dd-note">Czechia + Slovakia</span>}
                    {selectedId === "BAL" && <span className="world-badge dd-note">Estonia + Latvia + Lithuania</span>}
                    {selectedId === "YU" && <span className="world-badge dd-note">Six successors</span>}
                  </div>
                </div>
                <button className="secondary small-btn" onClick={() => setSelectedId(null)}>Clear</button>
              </div>

              <div className="world-side-section">
                <h3>Economy</h3>
                <div className="world-stat-grid">
                  <div className="world-stat">
                    <span className="world-stat-label">GDP</span>
                    <span className="world-stat-value">{formatMetric("gdp", selectedCountry.economy.gdp)}</span>
                  </div>
                  <div className="world-stat">
                    <span className="world-stat-label">Growth</span>
                    <span className="world-stat-value">{formatMetric("growth", selectedCountry.economy.growthRate)}</span>
                  </div>
                  <div className="world-stat">
                    <span className="world-stat-label">Inflation</span>
                    <span className="world-stat-value">{formatMetric("inflation", selectedCountry.economy.inflationRate)}</span>
                  </div>
                  <div className="world-stat">
                    <span className="world-stat-label">Unemployment</span>
                    <span className="world-stat-value">{formatMetric("unemployment", selectedCountry.economy.unemploymentRate)}</span>
                  </div>
                  <div className="world-stat" style={{ gridColumn: "1 / -1" }}>
                    <span className="world-stat-label">Output gap</span>
                    <span className="world-stat-value">{formatMetric("outputGap", selectedCountry.economy.outputGap)}</span>
                  </div>
                </div>
                {selectedId === "DD" && (
                  <p className="small muted" style={{ marginTop: 10, lineHeight: 1.4 }}>
                    Modern world-atlas 110m has unified Germany (DE, 276). DD economy shown here has no separate polygon; map Germany is tinted by DE’s metric. This rectangle-free limitation is intentional.
                  </p>
                )}
              </div>

              <div className="world-side-section">
                <h3>Parties · {selectedCountry.name} ({selectedParties.length})</h3>
                {selectedParties.length === 0 ? (
                  <p className="small muted">No parties for this country.</p>
                ) : (
                  <ul className="world-party-list">
                    {selectedParties.map((p) => (
                      <li key={p.id} className="world-party-item">
                        <span className="world-party-dot" style={{ background: p.color }} />
                        <span className="world-party-name">{p.name} <span className="muted small">({p.abbreviation})</span></span>
                        <span className="world-party-meta">{p.tier} · {p.organization.toFixed(0)} org · ${p.treasury.toLocaleString("en-US")}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="small muted" style={{ marginTop: 8, lineHeight: 1.4 }}>Fields present: color, abbreviation, organization, tier, treasury, politicalStrength, memberCount. Support fields shown as tier/org/treasury (mainline support proxy).</p>
              </div>

              <div className="world-side-section">
                <h3>Legislature</h3>
                {!selectedLegislature ? (
                  <p className="small muted">No legislature data for {selectedId}.</p>
                ) : (
                  <>
                    <p className="small" style={{ margin: "0 0 8px", color: "#e8e8ee" }}>{selectedLegislature.name} {selectedLegislature.bicameral ? "· bicameral" : "· unicameral"} · {selectedLegislature.chambers.length} chambers</p>
                    {selectedLegislature.chambers.map((ch) => {
                      const held = Object.values(ch.composition.seatsByParty).reduce((s, v) => s + v, 0);
                      return (
                        <div key={ch.key} className="world-leg-chamber">
                          <div className="world-leg-head">
                            <span className="world-leg-name">{ch.name}</span>
                            <span className={`world-leg-tag ${ch.elected ? "elected" : "appointed"}`}>{ch.elected ? "elected" : "appointed"}</span>
                          </div>
                          <div className="small muted" style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>{ch.seats} seats · {held} held · {ch.composition.vacancies} vacant</div>
                          {ch.description && <div className="small muted" style={{ marginTop: 4, lineHeight: 1.3 }}>{ch.description}</div>}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {hover && (
        <div className="world-tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <div style={{ fontWeight: 600 }}>{hover.name}</div>
          <div style={{ color: "#8a8a8a" }}>{hover.metricLabel}</div>
        </div>
      )}
    </div>
  );
}
