import { useMemo, useState } from "react";
import type { WorldState, Party, Legislature, Chamber } from "@ahdclient/engine";
import { PartyOperations } from "./PartyOperations.js";
import "./parties.css";

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return n.toLocaleString("en-US");
}

function formatIdeology(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : "—";
}

function IdeologyMarker({ economic, social }: { economic: number; social: number }) {
  const size = 36;
  const pad = 2;
  const inner = size - pad * 2;
  const safeEcon = Number.isFinite(economic) ? Math.max(-5, Math.min(5, economic)) : 0;
  const safeSocial = Number.isFinite(social) ? Math.max(-5, Math.min(5, social)) : 0;
  const x = ((safeEcon + 5) / 10) * inner + pad;
  const y = ((5 - safeSocial) / 10) * inner + pad;
  return (
    <span
      className="par-marker"
      style={{ width: size, height: size }}
      aria-label={`econ ${formatIdeology(economic)} social ${formatIdeology(social)}`}
    >
      <span className="par-marker-grid" />
      <span className="par-marker-dot" style={{ left: x, top: y }} />
    </span>
  );
}

function countryLabel(world: WorldState, id: string): string {
  const c = (world.countries as Record<string, { name?: string } | undefined>)[id];
  return c?.name ?? id;
}

function seatsForParty(legislature: Legislature | undefined, partyId: string): { total: number; byChamber: Array<{ key: string; name: string; seats: number }> } {
  if (!legislature) return { total: 0, byChamber: [] };
  const byChamber: Array<{ key: string; name: string; seats: number }> = [];
  let total = 0;
  for (const ch of legislature.chambers ?? []) {
    const seats = (ch.composition?.seatsByParty as Record<string, number> | undefined)?.[partyId] ?? 0;
    if (seats > 0) byChamber.push({ key: ch.key, name: ch.name, seats });
    total += seats;
  }
  return { total, byChamber };
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span className="par-bar-track" aria-hidden>
      <span className="par-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </span>
  );
}

const PALETTE = ["#3B82F6", "#EF4444", "#22C55E", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#EAB308", "#6366F1", "#14B8A6"] as const;

function partyColor(partyId: string, sortedIds: string[]): string {
  const idx = sortedIds.indexOf(partyId);
  if (idx === -1) {
    let h = 0;
    for (let i = 0; i < partyId.length; i++) h = (h * 31 + partyId.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length]!;
  }
  return PALETTE[idx % PALETTE.length]!;
}

export function PartiesScreen({
  world,
  onBack,
  initialCountryId,
  initialPartyId,
  onWorld,
  onToast,
}: {
  world: WorldState;
  onBack: () => void;
  initialCountryId?: string;
  initialPartyId?: string;
  onWorld?: (world: WorldState) => void;
  onToast?: (message: string) => void;
}) {
  const countryIds = useMemo(() => {
    const all = Object.keys(world.countries ?? {});
    return [...all].sort((a, b) => {
      const ca = (world.countries as Record<string, { playable?: boolean }>)[a];
      const cb = (world.countries as Record<string, { playable?: boolean }>)[b];
      const pa = ca?.playable ? 0 : 1;
      const pb = cb?.playable ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const na = countryLabel(world, a);
      const nb = countryLabel(world, b);
      return na.localeCompare(nb);
    });
  }, [world.countries]);

  const [selectedCountryId, setSelectedCountryId] = useState<string>(() => {
    if (initialCountryId && (world.countries as Record<string, unknown>)[initialCountryId]) return initialCountryId;
    return countryIds[0] ?? initialCountryId ?? "US";
  });

  const countryName = countryLabel(world, selectedCountryId);
  const isPlayable = !!(world.countries as Record<string, { playable?: boolean }>)[selectedCountryId]?.playable;

  const partiesRaw = world.parties as Record<string, Party> | undefined;
  const legislaturesRaw = world.legislatures as Record<string, Legislature> | undefined;
  const regionsRaw = world.regions as WorldState["regions"] | undefined;
  const partyRegionsRaw = world.partyRegions as WorldState["partyRegions"] | undefined;
  const partyPressuresRaw = world.partyPressures as WorldState["partyPressures"] | undefined;
  const politiciansRaw = world.politicians as WorldState["politicians"] | undefined;

  const countryParties: Party[] = useMemo(() => {
    const all = partiesRaw ? Object.values(partiesRaw) : [];
    return all.filter((p) => p.countryId === selectedCountryId).sort((a, b) => a.id.localeCompare(b.id));
  }, [partiesRaw, selectedCountryId]);

  const sortedPartyIds = useMemo(() => countryParties.map((p) => p.id), [countryParties]);

  const regions = useMemo(() => {
    if (!regionsRaw) return [];
    return Object.values(regionsRaw)
      .filter((r) => r.countryId === selectedCountryId)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [regionsRaw, selectedCountryId]);

  const hasPartyRegionData = useMemo(() => {
    if (!partyRegionsRaw || !countryParties.length) return false;
    return countryParties.some((p) => regions.some((r) => `${r.id}:${p.id}` in partyRegionsRaw));
  }, [partyRegionsRaw, countryParties, regions]);

  const hasPressureData = useMemo(() => {
    if (!partyPressuresRaw || !countryParties.length) return false;
    return countryParties.some((p) => regions.some((r) => `${p.id}:${r.id}` in partyPressuresRaw));
  }, [partyPressuresRaw, countryParties, regions]);

  const legislature = legislaturesRaw?.[selectedCountryId];

  const maxTreasury = useMemo(() => Math.max(0, ...countryParties.map((p) => p.treasury ?? 0)), [countryParties]);
  const maxStrength = useMemo(() => Math.max(0, ...countryParties.map((p) => p.politicalStrength ?? 0)), [countryParties]);
  const maxOrg = useMemo(() => Math.max(0, ...countryParties.map((p) => p.organization ?? 0)), [countryParties]);
  const maxMembers = useMemo(() => Math.max(0, ...countryParties.map((p) => p.memberCount ?? 0)), [countryParties]);

  const [selectedPartyId, setSelectedPartyId] = useState<string>(() => {
    if (initialPartyId && countryParties.some((party) => party.id === initialPartyId)) {
      return initialPartyId;
    }
    return countryParties[0]?.id ?? "";
  });

  // keep selected party in sync when country changes
  const effectivePartyId = useMemo(() => {
    if (countryParties.some((p) => p.id === selectedPartyId)) return selectedPartyId;
    return countryParties[0]?.id ?? "";
  }, [countryParties, selectedPartyId]);

  const selectedParty: Party | undefined = useMemo(() => {
    if (!effectivePartyId) return undefined;
    return partiesRaw?.[effectivePartyId];
  }, [partiesRaw, effectivePartyId]);

  const seatsInfo = useMemo(() => {
    if (!selectedParty) return { total: 0, byChamber: [] as Array<{ key: string; name: string; seats: number }> };
    return seatsForParty(legislature, selectedParty.id);
  }, [legislature, selectedParty]);

  const partyPoliticians = useMemo(() => {
    if (!selectedParty || !politiciansRaw) return [];
    return politiciansRaw.filter((pol) => pol.partyId === selectedParty.id && pol.countryId === selectedCountryId);
  }, [politiciansRaw, selectedParty, selectedCountryId]);

  const priorityIds = useMemo(() => {
    const pr = selectedParty?.priorityRegion;
    if (!pr || !Array.isArray(pr.regionIds)) return new Set<string>();
    return new Set(pr.regionIds);
  }, [selectedParty]);

  const chambersByKey = useMemo(() => {
    const m = new Map<string, Chamber>();
    if (legislature) for (const ch of legislature.chambers ?? []) m.set(ch.key, ch);
    return m;
  }, [legislature]);

  const isPreV8 = !regionsRaw || Object.keys(regionsRaw).length === 0;

  return (
    <div className="par-screen">
      <header className="par-header">
        <div className="row spread par-header-inner">
          <div className="row" style={{ gap: 12 }}>
            <h1 className="par-title">PARTIES</h1>
            <span className="muted small par-subtitle">
              {countryName} · Turn {world.meta?.turn ?? "—"} · {world.meta?.date ?? ""}
            </span>
          </div>
          <div className="row">
            <button className="secondary small-btn" onClick={onBack}>Back to dashboard</button>
          </div>
        </div>
        <div className="par-controls">
          <label className="par-label">
            Country
            <select
              value={selectedCountryId}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedCountryId(next);
                const nextParties = partiesRaw ? Object.values(partiesRaw).filter((p) => p.countryId === next).sort((a,b)=>a.id.localeCompare(b.id)) : [];
                setSelectedPartyId(nextParties[0]?.id ?? "");
              }}
            >
              {countryIds.map((id) => {
                const playable = !!(world.countries as Record<string, { playable?: boolean }>)[id]?.playable;
                return (
                  <option key={id} value={id}>{countryLabel(world, id)} ({id}){playable ? " · playable" : ""}</option>
                );
              })}
            </select>
          </label>
          {!isPlayable && countryParties.length === 0 && (
            <span className="muted small par-not-modeled">Non-playable country: parties not modeled.</span>
          )}
        </div>
      </header>

      {isPreV8 && (
        <div className="panel par-notice">
          <span className="muted small">Save predates regional party model (pre-v8): regional breakdown not modeled for this save.</span>
        </div>
      )}

      {countryParties.length === 0 ? (
        <div className="panel">
          <p className="muted">No parties for {selectedCountryId}.</p>
          <p className="muted small">This country is not modeled with a party layer. Playable countries have full party data.</p>
        </div>
      ) : (
        <>
          <section className="panel par-compare">
            <h2>Comparison · {countryName}</h2>
            <div className="par-compare-grid">
              {[
                { label: "Treasury", max: maxTreasury, get: (p: Party) => p.treasury ?? 0, fmt: (v: number) => formatNum(v) },
                { label: "Strength", max: maxStrength, get: (p: Party) => p.politicalStrength ?? 0, fmt: (v: number) => formatNum(v) },
                { label: "Organization", max: maxOrg, get: (p: Party) => p.organization ?? 0, fmt: (v: number) => String(v) },
                { label: "Members", max: maxMembers, get: (p: Party) => p.memberCount ?? 0, fmt: (v: number) => String(v) },
              ].map((metric) => (
                <div key={metric.label} className="par-compare-metric">
                  <div className="par-compare-metric-head">
                    <span className="par-compare-label">{metric.label}</span>
                    <span className="muted small">max {metric.fmt(metric.max)}</span>
                  </div>
                  <div className="par-compare-bars">
                    {countryParties.map((p) => {
                      const v = metric.get(p);
                      const color = partyColor(p.id, sortedPartyIds);
                      return (
                        <div key={p.id} className="par-compare-row">
                          <span className="par-compare-abbr" title={p.name}><span className="par-swatch" style={{ background: color }} />{p.abbreviation}</span>
                          <Bar value={v} max={metric.max} color={color} />
                          <span className="par-compare-val">{metric.fmt(v)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="par-layout">
            <div className="par-list-col">
              <section className="panel par-section">
                <h2>Parties · {countryName}</h2>
                <ul className="par-list">
                  {countryParties.map((party) => {
                    const color = partyColor(party.id, sortedPartyIds);
                    const active = party.id === effectivePartyId;
                    const tier = party.tier ?? "minor";
                    return (
                      <li
                        key={party.id}
                        className={`par-card ${active ? "active" : ""}`}
                        onClick={() => setSelectedPartyId(party.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedPartyId(party.id); }}
                        aria-pressed={active}
                      >
                        <div className="par-card-top row spread">
                          <span className="par-card-name"><span className="par-swatch" style={{ background: color }} />{party.name}<span className="muted small par-abbr">({party.abbreviation})</span></span>
                          <span className={`par-tier ${tier}`}>{tier}</span>
                        </div>
                        <div className="par-card-mid">
                          <IdeologyMarker economic={party.economicPosition} social={party.socialPosition} />
                          <div className="par-card-stats">
                            <span className="par-stat"><span className="par-stat-k">Treasury</span><span className="par-stat-v">{formatNum(party.treasury ?? 0)}</span></span>
                            <span className="par-stat"><span className="par-stat-k">Strength</span><span className="par-stat-v">{formatNum(party.politicalStrength ?? 0)}</span></span>
                            <span className="par-stat"><span className="par-stat-k">Org</span><span className="par-stat-v">{party.organization ?? 0}</span></span>
                            <span className="par-stat"><span className="par-stat-k">Members</span><span className="par-stat-v">{party.memberCount ?? 0}</span></span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>

            <div className="par-detail-col">
              {!selectedParty ? (
                <div className="panel"><p className="muted">Select a party.</p></div>
              ) : (
                <section className="panel par-detail">
                  <div className="par-detail-head">
                    <div className="row" style={{ gap: 8 }}>
                      <span className="par-swatch" style={{ background: partyColor(selectedParty.id, sortedPartyIds), width: 14, height: 14 }} />
                      <strong>{selectedParty.name}</strong>
                      <span className="muted small">({selectedParty.abbreviation})</span>
                      <span className={`par-tier ${selectedParty.tier ?? "minor"}`}>{selectedParty.tier ?? "minor"}</span>
                    </div>
                    <IdeologyMarker economic={selectedParty.economicPosition} social={selectedParty.socialPosition} />
                  </div>
                  <div className="par-detail-pos muted small">econ {formatIdeology(selectedParty.economicPosition)} / social {formatIdeology(selectedParty.socialPosition)} · {selectedParty.color ?? ""}</div>

                  <div className="par-detail-grid">
                    <div className="par-detail-stat"><span className="par-detail-k">Treasury</span><span className="par-detail-v">{formatNum(selectedParty.treasury ?? 0)}</span></div>
                    <div className="par-detail-stat"><span className="par-detail-k">Political strength</span><span className="par-detail-v">{formatNum(selectedParty.politicalStrength ?? 0)}</span></div>
                    <div className="par-detail-stat"><span className="par-detail-k">Organization (national)</span><span className="par-detail-v">{selectedParty.organization ?? 0}</span></div>
                    <div className="par-detail-stat"><span className="par-detail-k">Members</span><span className="par-detail-v">{selectedParty.memberCount ?? 0}</span></div>
                  </div>

                  <div className="par-seats">
                    <h3>Seats held</h3>
                    {legislature ? (
                      <>
                        <div className="muted small">Total {seatsInfo.total} across {legislature.chambers.length} chambers</div>
                        {legislature.chambers.length === 0 ? (
                          <p className="muted small">No chambers for this country.</p>
                        ) : (
                          <ul className="par-seats-list">
                            {legislature.chambers.map((ch) => {
                              const seats = (ch.composition?.seatsByParty as Record<string, number> | undefined)?.[selectedParty.id] ?? 0;
                              return (
                                <li key={ch.key} className="par-seats-row">
                                  <span>{ch.name} <span className="muted small">({ch.shortName})</span></span>
                                  <span className="par-seats-count">{seats} / {ch.seats}{ch.elected ? "" : " · appointed"}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </>
                    ) : (
                      <p className="muted small">No legislature for this country: seats not modeled.</p>
                    )}
                  </div>

                  <div className="par-regions">
                    <h3>Regional breakdown</h3>
                    {!hasPartyRegionData || regions.length === 0 ? (
                      <p className="muted small">Regional organization not modeled for this save or country.</p>
                    ) : (
                      <div className="par-table-wrap">
                        <table className="par-table">
                          <thead>
                            <tr>
                              <th>Region</th>
                              <th>Org</th>
                              <th>Reg</th>
                              <th>Pressure</th>
                              <th>Priority</th>
                            </tr>
                          </thead>
                          <tbody>
                            {regions.map((r) => {
                              const prKey = `${r.id}:${selectedParty.id}`;
                              const pressureKey = `${selectedParty.id}:${r.id}`;
                              const pr = (partyRegionsRaw as Record<string, { organization?: number; registration?: number } | undefined>)?.[prKey];
                              const pressure = (partyPressuresRaw as Record<string, { value?: number } | undefined>)?.[pressureKey];
                              const org = pr?.organization;
                              const reg = pr?.registration;
                              const pres = pressure?.value;
                              const isPriority = priorityIds.has(r.id);
                              return (
                                <tr key={r.id}>
                                  <td>{r.name}<span className="muted small" style={{ marginLeft: 6 }}>{r.id}</span></td>
                                  <td style={{ textAlign: "right" }}>{org !== undefined ? org : "—"}</td>
                                  <td style={{ textAlign: "right" }}>{reg !== undefined ? reg : "—"}</td>
                                  <td style={{ textAlign: "right" }}>{hasPressureData ? (pres !== undefined ? pres : "—") : "—"}</td>
                                  <td style={{ textAlign: "center" }}>{isPriority ? "★" : ""}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="par-roster">
                    <h3>Politicians · {partyPoliticians.length}</h3>
                    {partyPoliticians.length === 0 ? (
                      <p className="muted small">No seated politicians for this party.</p>
                    ) : (
                      <div className="par-table-wrap">
                        <table className="par-table gov-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Chamber</th>
                              <th>Age</th>
                            </tr>
                          </thead>
                          <tbody>
                            {partyPoliticians
                              .slice()
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map((pol) => {
                                const ch = chambersByKey.get(pol.chamberKey);
                                return (
                                  <tr key={pol.id}>
                                    <td className="gov-name-cell">{pol.name}</td>
                                    <td>{ch ? ch.name : pol.chamberKey}</td>
                                    <td style={{ textAlign: "right" }}>{pol.age}</td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {selectedParty.id === (world.player.partyId ?? world.player.hosPartyId) && selectedCountryId === world.player.countryId && (
                    <PartyOperations world={world} onWorld={onWorld} onToast={onToast} />
                  )}
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
