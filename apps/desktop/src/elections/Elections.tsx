import { useMemo, useState } from "react";
import type { WorldState } from "@ahdclient/engine";
import type { ElectionRecord, ElectionCandidate } from "@ahdclient/engine";
import { game } from "../game.js";

type Props = {
  world: WorldState;
  onWorld: (w: WorldState) => void;
  onToast?: (msg: string) => void;
  onBack: () => void;
  onOpenCharacter?: () => void;
};

function safeStr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
function safeNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function safeArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

const PALETTE = ["#3B82F6", "#EF4444", "#22C55E", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#EAB308", "#6366F1", "#14B8A6"] as const;

function partyColor(pid: string, sortedIds: string[]): string {
  const idx = sortedIds.indexOf(pid);
  if (idx !== -1) return PALETTE[idx % PALETTE.length]!;
  let h = 0;
  for (let i = 0; i < pid.length; i++) h = (h * 31 + pid.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

function raceLabel(rec: ElectionRecord): string {
  const st = safeStr((rec as unknown as Record<string, unknown>)["state"] as unknown, "");
  const type = safeStr((rec as unknown as Record<string, unknown>)["electionType"] as unknown, "race");
  const cls = (rec as unknown as Record<string, unknown>)["senateClass"] as number | undefined;
  if (st && cls) return `${st} ${type} (Class ${cls})`;
  if (st) return `${st} ${type}`;
  if (cls) return `${type} Class ${cls}`;
  return type;
}

function humanType(electionType: string): string {
  if (electionType === "house") return "House";
  if (electionType === "senate") return "Senate";
  if (electionType === "commons") return "Commons";
  if (electionType === "volkskammerDeputy") return "Volkskammer";
  if (electionType === "supremeSovietDeputy") return "Supreme Soviet (Union)";
  if (electionType === "nationalitiesDeputy") return "Supreme Soviet (Nationalities)";
  return electionType;
}

function groupKey(rec: ElectionRecord): string {
  const type = safeStr((rec as unknown as Record<string, unknown>)["electionType"] as unknown, "other");
  if (type === "house") return "House";
  if (type === "senate") {
    const cls = (rec as unknown as Record<string, unknown>)["senateClass"] as number | undefined;
    if (cls) return `Senate Class ${cls}`;
    return "Senate";
  }
  return humanType(type);
}

function groupOrder(key: string): number {
  if (key === "House") return 0;
  if (key.startsWith("Senate")) return 1;
  return 2;
}

export function ElectionsScreen({ world, onWorld, onToast, onBack, onOpenCharacter }: Props) {
  const meta = (world as unknown as Record<string, unknown>)["meta"] as Record<string, unknown> | undefined;
  const turn = safeNum(meta?.["turn"] as unknown, 0);
  const date = safeStr(meta?.["date"] as unknown, "");
  const player = (world as unknown as Record<string, unknown>)["player"] as Record<string, unknown> | undefined;
  const playerCountryId = safeStr(player?.["countryId"] as unknown, "");
  const rawElections = safeArray<ElectionRecord>((world as unknown as Record<string, unknown>)["elections"] as unknown);
  const parties = ((world as unknown as Record<string, unknown>)["parties"] as Record<string, { name?: string; abbreviation?: string; color?: string }> | undefined) ?? {};
  const sortedPartyIds = useMemo(() => Object.keys(parties).sort(), [parties]);

  const isPreV13 = !Array.isArray((world as unknown as Record<string, unknown>)["elections"]);

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [myRacesOnly, setMyRacesOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const countryRaces = useMemo(() => {
    return rawElections.filter((r) => {
      const cid = safeStr((r as unknown as Record<string, unknown>)["countryId"] as unknown, "");
      return cid === playerCountryId;
    });
  }, [rawElections, playerCountryId]);

  const upcomingActive = useMemo(() => {
    return countryRaces.filter((r) => {
      const s = safeStr((r as unknown as Record<string, unknown>)["status"] as unknown, "");
      return s === "upcoming" || s === "active";
    });
  }, [countryRaces]);

  const resolved = useMemo(() => {
    const arr = countryRaces.filter((r) => safeStr((r as unknown as Record<string, unknown>)["status"] as unknown, "") === "resolved");
    arr.sort((a, b) => {
      const at = safeNum((a as unknown as Record<string, unknown>)["resolvedTurn"] as unknown ?? (a as unknown as Record<string, unknown>)["endTurn"] as unknown, 0);
      const bt = safeNum((b as unknown as Record<string, unknown>)["resolvedTurn"] as unknown ?? (b as unknown as Record<string, unknown>)["endTurn"] as unknown, 0);
      if (bt !== at) return bt - at;
      return safeStr((b as unknown as Record<string, unknown>)["id"] as unknown, "").localeCompare(safeStr((a as unknown as Record<string, unknown>)["id"] as unknown, ""));
    });
    return arr;
  }, [countryRaces]);

  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of upcomingActive) {
      const gk = groupKey(r);
      set.add(gk);
    }
    return [...set].sort((a, b) => groupOrder(a) - groupOrder(b) || a.localeCompare(b));
  }, [upcomingActive]);

  const filteredBoard = useMemo(() => {
    let arr = [...upcomingActive];
    if (typeFilter !== "all") {
      arr = arr.filter((r) => groupKey(r) === typeFilter);
    }
    if (myRacesOnly) {
      arr = arr.filter((r) => safeArray<ElectionCandidate>((r as unknown as Record<string, unknown>)["candidates"] as unknown).some((c) => c.id === "player"));
    }
    arr.sort((a, b) => {
      const at = safeNum((a as unknown as Record<string, unknown>)["endTurn"] as unknown, 0);
      const bt = safeNum((b as unknown as Record<string, unknown>)["endTurn"] as unknown, 0);
      if (at !== bt) return at - bt;
      return safeStr((a as unknown as Record<string, unknown>)["id"] as unknown, "").localeCompare(safeStr((b as unknown as Record<string, unknown>)["id"] as unknown, ""));
    });
    return arr;
  }, [upcomingActive, typeFilter, myRacesOnly]);

  const grouped = useMemo(() => {
    const map = new Map<string, ElectionRecord[]>();
    for (const r of filteredBoard) {
      const gk = groupKey(r);
      if (!map.has(gk)) map.set(gk, []);
      map.get(gk)!.push(r);
    }
    const entries = [...map.entries()].sort((a, b) => groupOrder(a[0]) - groupOrder(b[0]) || a[0].localeCompare(b[0]));
    return entries;
  }, [filteredBoard]);

  const selected = useMemo(() => {
    if (selectedId) {
      const found = countryRaces.find((r) => safeStr((r as unknown as Record<string, unknown>)["id"] as unknown, "") === selectedId);
      if (found) return found;
    }
    return filteredBoard[0] ?? null;
  }, [selectedId, countryRaces, filteredBoard]);

  function refreshWorld() {
    const w = game.getStateSync();
    if (w) {
      onWorld({
        ...w,
        meta: { ...w.meta },
        player: { ...w.player, actionCooldowns: { ...w.player.actionCooldowns }, purgeRejoinBlocks: [...(w.player.purgeRejoinBlocks ?? [])] },
        parties: { ...w.parties },
        news: [...w.news],
        elections: [...(w.elections as ElectionRecord[] ?? [])],
      } as WorldState);
    }
  }

  function handleDeclare(electionId: string) {
    setActionError(null);
    setActionBusy(electionId);
    const result = game.executeAction("declareCandidacy", { electionId } as unknown as Record<string, unknown>);
    setActionBusy(null);
    if (result.ok) {
      if (onToast) onToast(result.message);
      refreshWorld();
    } else {
      setActionError(result.error);
    }
  }

  function handleWithdraw(electionId: string) {
    setActionError(null);
    setActionBusy(electionId);
    const result = game.executeAction("withdrawCandidacy", { electionId } as unknown as Record<string, unknown>);
    setActionBusy(null);
    if (result.ok) {
      if (onToast) onToast(result.message);
      refreshWorld();
    } else {
      setActionError(result.error);
    }
  }

  const countryName = safeStr(((world as unknown as Record<string, unknown>)["countries"] as Record<string, { name?: string }> | undefined)?.[playerCountryId]?.name as unknown, playerCountryId);

  return (
    <div className="elections-screen">
      <header className="elections-header">
        <div className="row spread elections-header-inner">
          <div className="row" style={{ gap: 12 }}>
            <h1 className="elections-title">ELECTIONS</h1>
            <span className="muted small elections-subtitle">
              {countryName} ({playerCountryId}) · Turn {turn} {date ? `· ${date}` : ""}
            </span>
          </div>
          <div className="row">
            <button className="secondary small-btn" onClick={onBack}>Back to dashboard</button>
          </div>
        </div>
        <div className="elections-controls">
          <div className="elections-chips" role="group" aria-label="Filter by type">
            <button
              className={`elections-chip ${typeFilter === "all" ? "active" : ""}`}
              onClick={() => setTypeFilter("all")}
              aria-pressed={typeFilter === "all"}
            >
              all <span className="elections-chip-count">{upcomingActive.length}</span>
            </button>
            {availableTypes.map((t) => {
              const count = upcomingActive.filter((r) => groupKey(r) === t).length;
              return (
                <button
                  key={t}
                  className={`elections-chip ${typeFilter === t ? "active" : ""}`}
                  onClick={() => setTypeFilter(t)}
                  aria-pressed={typeFilter === t}
                >
                  {t} <span className="elections-chip-count">{count}</span>
                </button>
              );
            })}
            <button
              className={`elections-chip elections-chip-my ${myRacesOnly ? "active" : ""}`}
              onClick={() => setMyRacesOnly((v) => !v)}
              aria-pressed={myRacesOnly}
              title="Show only races where you are a candidate"
            >
              my races
            </button>
          </div>
        </div>
      </header>

      {isPreV13 && (
        <div className="panel elections-notice">
          <span className="muted small">Save predates elections (pre-v13): no election data for this save. Advance turns in a new world to see races.</span>
        </div>
      )}

      <div className="elections-layout">
        <div className="elections-board-col">
          <section className="panel elections-section">
            <div className="row spread" style={{ alignItems: "center" }}>
              <h2>Race board · {filteredBoard.length} {filteredBoard.length === 1 ? "race" : "races"}</h2>
              <span className="muted small">{myRacesOnly ? "my races" : typeFilter !== "all" ? typeFilter : "all types"}</span>
            </div>

            {filteredBoard.length === 0 ? (
              <div className="elections-empty">
                <p className="muted">{isPreV13 ? "No elections yet for this save." : myRacesOnly || typeFilter !== "all" ? "No races match your filters." : "No upcoming or active races."}</p>
                {(myRacesOnly || typeFilter !== "all") && (
                  <button className="secondary small-btn" onClick={() => { setTypeFilter("all"); setMyRacesOnly(false); }}>Reset filters</button>
                )}
                {!isPreV13 && filteredBoard.length === 0 && !myRacesOnly && typeFilter === "all" && (
                  <p className="muted small">Races spawn as election cycles approach. Advance turns to see new filings.</p>
                )}
              </div>
            ) : (
              <div className="elections-groups">
                {grouped.map(([gkey, races]) => (
                  <div key={gkey} className="elections-group">
                    <div className="elections-group-head">
                      <span className="elections-group-title">{gkey}</span>
                      <span className="muted small">{races.length} {races.length === 1 ? "race" : "races"}</span>
                    </div>
                    <div className="elections-race-list">
                      {races.map((rec) => {
                        const id = safeStr((rec as unknown as Record<string, unknown>)["id"] as unknown, "");
                        const status = safeStr((rec as unknown as Record<string, unknown>)["status"] as unknown, "");
                        const filingTurn = safeNum((rec as unknown as Record<string, unknown>)["primaryEndTurn"] as unknown, 0);
                        const electionTurn = safeNum((rec as unknown as Record<string, unknown>)["endTurn"] as unknown, 0);
                        const candidates = safeArray<ElectionCandidate>((rec as unknown as Record<string, unknown>)["candidates"] as unknown);
                        const isCandidate = candidates.some((c) => c.id === "player");
                        const filingOpen = turn <= filingTurn;
                        const isSelected = selected ? safeStr((selected as unknown as Record<string, unknown>)["id"] as unknown, "") === id : false;
                        return (
                          <div
                            key={id}
                            className={`elections-race-card ${isSelected ? "active" : ""} ${status}`}
                            onClick={() => setSelectedId(id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedId(id); }}
                          >
                            <div className="elections-race-head">
                              <span className="elections-race-title">{raceLabel(rec)}</span>
                              <span className={`elections-badge ${status}`}>{status}</span>
                            </div>
                            <div className="elections-race-meta muted small">
                              <span>Filing T{filingTurn}</span>
                              <span>·</span>
                              <span>Election T{electionTurn}</span>
                              <span>·</span>
                              <span>{candidates.length} cand.</span>
                            </div>
                            <div className="elections-race-foot">
                              <span className={`elections-candidacy ${isCandidate ? "declared" : filingOpen ? "open" : "closed"}`}>
                                {isCandidate ? "You are declared" : filingOpen ? "Filing open" : "Filing closed"}
                              </span>
                              <span className="muted small" style={{ fontFamily: "ui-monospace, monospace", fontSize: 10 }}>{id}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel elections-section">
            <h2>Results · recently resolved</h2>
            {resolved.length === 0 ? (
              <div className="elections-empty"><p className="muted small">No resolved races yet.</p></div>
            ) : (
              <div className="elections-results-list">
                {resolved.slice(0, 20).map((rec) => {
                  const id = safeStr((rec as unknown as Record<string, unknown>)["id"] as unknown, "");
                  const winners = safeArray<string>((rec as unknown as Record<string, unknown>)["winners"] as unknown);
                  const resolvedTurn = safeNum((rec as unknown as Record<string, unknown>)["resolvedTurn"] as unknown, 0);
                  const isElectionNight = resolvedTurn === turn;
                  const candidates = safeArray<ElectionCandidate>((rec as unknown as Record<string, unknown>)["candidates"] as unknown);
                  const candById = new Map(candidates.map((c) => [c.id, c]));
                  const playerWon = winners.includes("player");
                  const playerWasCandidate = candidates.some((c) => c.id === "player");
                  return (
                    <div key={id} className={`elections-result-card ${isElectionNight ? "pulse" : ""} ${playerWasCandidate ? (playerWon ? "player-won" : "player-lost") : ""}`}>
                      <div className="elections-result-head row spread" style={{ alignItems: "center" }}>
                        <span className="elections-result-title">{raceLabel(rec)}</span>
                        {isElectionNight && <span className="elections-pulse">election night</span>}
                      </div>
                      <div className="muted small">T{winners.length > 0 ? resolvedTurn : safeNum((rec as unknown as Record<string, unknown>)["endTurn"] as unknown, 0)} · {winners.length} winner{winners.length === 1 ? "" : "s"} · {safeNum((rec as unknown as Record<string, unknown>)["totalSeats"] as unknown, 0)} seat{safeNum((rec as unknown as Record<string, unknown>)["totalSeats"] as unknown, 0) === 1 ? "" : "s"}</div>
                      <div className="elections-winners">
                        {winners.length === 0 ? (
                          <span className="muted small">No winners recorded</span>
                        ) : (
                          winners.map((wid) => {
                            const cand = candById.get(wid);
                            const partyAbbr = cand ? (parties[cand.partyId]?.abbreviation ?? cand.partyId) : wid;
                            const color = cand ? (parties[cand.partyId]?.color ?? partyColor(cand.partyId, sortedPartyIds)) : "#888";
                            const isPlayer = wid === "player";
                            return (
                              <span key={wid} className={`elections-winner ${isPlayer ? "player" : ""}`}>
                                <span className="elections-swatch" style={{ background: color }} />
                                <span className="elections-winner-name">{cand?.name ?? wid}</span>
                                <span className="muted small">({partyAbbr})</span>
                                {cand?.incumbent && <span className="elections-incumbent">inc.</span>}
                                {isPlayer && <span className="elections-player-badge">you</span>}
                              </span>
                            );
                          })
                        )}
                      </div>
                      {playerWasCandidate && (
                        <div className={`muted small elections-player-result ${playerWon ? "won" : "lost"}`}>
                          {playerWon ? "You won this race." : "You lost this race."}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="panel elections-section elections-detail-col">
          {!selected ? (
            <div className="elections-empty"><p className="muted small">Select a race to view candidates and file.</p></div>
          ) : (
            (() => {
              const rec = selected;
              const id = safeStr((rec as unknown as Record<string, unknown>)["id"] as unknown, "");
              const status = safeStr((rec as unknown as Record<string, unknown>)["status"] as unknown, "");
              const filingTurn = safeNum((rec as unknown as Record<string, unknown>)["primaryEndTurn"] as unknown, 0);
              const electionTurn = safeNum((rec as unknown as Record<string, unknown>)["endTurn"] as unknown, 0);
              const startTurn = safeNum((rec as unknown as Record<string, unknown>)["startTurn"] as unknown, 0);
              const candidates = safeArray<ElectionCandidate>((rec as unknown as Record<string, unknown>)["candidates"] as unknown);
              const tally = ((rec as unknown as Record<string, unknown>)["tally"] as Record<string, number> | undefined) ?? {};
              const isCandidate = candidates.some((c) => c.id === "player");
              const filingOpen = turn <= filingTurn;
              const isOwnCountry = safeStr((rec as unknown as Record<string, unknown>)["countryId"] as unknown, "") === playerCountryId;
              const showDeclare = !isCandidate && (status === "active" || status === "upcoming") && filingOpen && isOwnCountry;
              const showWithdraw = isCandidate && status !== "resolved";
              const totalVotes = Object.values(tally).reduce((s, v) => s + (Number.isFinite(v as number) ? v as number : 0), 0);
              const accumulationStarted = turn > filingTurn && totalVotes > 0;
              const filingCountdown = filingTurn - turn;
              const electionCountdown = electionTurn - turn;
              const sortedCands = [...candidates].sort((a, b) => {
                const av = tally[a.id] ?? 0;
                const bv = tally[b.id] ?? 0;
                if (bv !== av) return bv - av;
                return a.name.localeCompare(b.name);
              });
              return (
                <div className="elections-detail">
                  <div className="elections-detail-head">
                    <h3>{raceLabel(rec)}</h3>
                    <div className="muted small" style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{id} · {status} · {safeNum((rec as unknown as Record<string, unknown>)["totalSeats"] as unknown, 0)} seat{safeNum((rec as unknown as Record<string, unknown>)["totalSeats"] as unknown, 0) === 1 ? "" : "s"} · {safeStr((rec as unknown as Record<string, unknown>)["chamberKey"] as unknown, "")}</div>
                    <div className="elections-countdowns">
                      <span className={`elections-countdown ${filingOpen ? "" : "closed"}`}>
                        Filing {filingOpen ? `closes in ${filingCountdown} turn${filingCountdown === 1 ? "" : "s"} (T${filingTurn})` : `closed T${filingTurn}`}
                      </span>
                      <span className="elections-countdown">
                        Election in {electionCountdown} turn{electionCountdown === 1 ? "" : "s"} (T{electionTurn}) · started T{startTurn}
                      </span>
                    </div>
                  </div>

                  <div className="elections-candidates">
                    <div className="row spread" style={{ alignItems: "center" }}>
                      <h4>Candidates · {candidates.length}</h4>
                      <span className="muted small">{accumulationStarted ? "live tally shares" : turn <= filingTurn ? "filing" : "tally not yet started"}</span>
                    </div>
                    {candidates.length === 0 ? (
                      <p className="muted small">No candidates yet. Filings open before the primary; on activation incumbents and party slates file.</p>
                    ) : (
                      <ul className="elections-cand-list">
                        {sortedCands.map((cand) => {
                          const votes = tally[cand.id] ?? 0;
                          const pct = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
                          const partyAbbr = parties[cand.partyId]?.abbreviation ?? cand.partyId;
                          const color = parties[cand.partyId]?.color ?? partyColor(cand.partyId, sortedPartyIds);
                          const isPlayer = cand.id === "player";
                          return (
                            <li key={cand.id} className={`elections-cand ${isPlayer ? "player" : ""}`}>
                              <div className="elections-cand-top row spread" style={{ alignItems: "center" }}>
                                <span className="elections-cand-name">
                                  <span className="elections-swatch" style={{ background: color }} />
                                  <strong>{cand.name}</strong>
                                  {isPlayer && <span className="elections-player-badge">you</span>}
                                  {cand.incumbent && <span className="elections-incumbent">incumbent</span>}
                                </span>
                                <span className="muted small">{partyAbbr} · {cand.partyId}</span>
                              </div>
                              <div className="elections-cand-bar-row">
                                <div className="elections-bar-track" aria-hidden>
                                  <div
                                    className="elections-bar-fill"
                                    style={{ width: `${accumulationStarted ? pct : 0}%`, background: color, opacity: accumulationStarted ? 1 : 0.15 }}
                                  />
                                </div>
                                <span className="elections-pct muted small">
                                  {accumulationStarted ? `${pct.toFixed(1)}% · ${votes.toLocaleString("en-US")} votes` : "—"}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="elections-actions">
                    {showDeclare && (
                      <button
                        className="small-btn"
                        onClick={() => handleDeclare(id)}
                        disabled={actionBusy === id}
                      >
                        {actionBusy === id ? "Filing..." : "DECLARE"}
                      </button>
                    )}
                    {showWithdraw && (
                      <button
                        className="secondary small-btn"
                        onClick={() => handleWithdraw(id)}
                        disabled={actionBusy === id}
                      >
                        {actionBusy === id ? "Withdrawing..." : "WITHDRAW"}
                      </button>
                    )}
                    {!showDeclare && !showWithdraw && (
                      <span className="muted small">
                        {isCandidate ? "You are filed in this race." : filingOpen ? "Eligible filing window but button hidden for cross-country race." : "Filing closed for this race."}
                      </span>
                    )}
                  </div>

                  {actionError && (
                    <div className="elections-error" role="alert">
                      <span>{actionError}</span>
                      {actionError.toLowerCase().includes("party membership") && onOpenCharacter && (
                        <button className="secondary small-btn" onClick={onOpenCharacter} style={{ marginLeft: 8 }}>
                          Join a party
                        </button>
                      )}
                      {actionError.toLowerCase().includes("party membership") && !onOpenCharacter && (
                        <span className="muted small" style={{ marginLeft: 8 }}>Open CHARACTER to join a party.</span>
                      )}
                    </div>
                  )}

                  <div className="muted small elections-detail-foot">
                    Filing deadline primaryEndTurn T{filingTurn} · Election endTurn T{electionTurn} · Candidate count {candidates.length} · Your status {isCandidate ? "declared" : "not declared"}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}
