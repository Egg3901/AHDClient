import { useState, useMemo } from "react";
import type { WorldState } from "@rotunda/engine";
import { ACTION_CATALOG, getActionCost } from "@rotunda/engine";
import { game } from "../game.js";
import "./character.css";

type Props = {
  world: WorldState;
  open: boolean;
  onClose: () => void;
  onWorld?: (w: WorldState) => void;
  onToast?: (msg: string) => void;
};

function formatNum(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US") : String(n);
}

function IdeologyMarker({ econ, social }: { econ: number; social: number }) {
  const size = 28;
  const pad = 2;
  const inner = size - pad * 2;
  const se = Math.max(-5, Math.min(5, econ));
  const ss = Math.max(-5, Math.min(5, social));
  const x = ((se + 5) / 10) * inner + pad;
  const y = ((5 - ss) / 10) * inner + pad;
  return (
    <span className="character-ideology-marker" style={{ width: size, height: size }} aria-label={`econ ${econ} social ${social}`}>
      <span className="character-ideology-grid" />
      <span className="character-ideology-dot" style={{ left: x, top: y }} />
    </span>
  );
}

function costLabel(entry: { baseCost: number } | null, ap: number, funds: number): string {
  if (!entry) return "";
  const parts: string[] = [];
  if (ap !== 0) parts.push(`${ap} AP`);
  if (funds > 0) parts.push(`${funds.toLocaleString("en-US")} funds`);
  return parts.length ? parts.join(" · ") : "Free";
}

export function CharacterPanel({ world, open, onClose, onWorld, onToast }: Props) {
  if (!open) return null;
  const player = world.player;
  const countryName = world.countries[player.countryId]?.name ?? player.countryId;
  const party = player.partyId ? world.parties[player.partyId] : null;
  const caucus = player.caucusId ? world.caucuses.find((c) => c.id === player.caucusId) ?? null : null;

  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [leaveCaucusConfirm, setLeaveCaucusConfirm] = useState(false);
  const [partyError, setPartyError] = useState<string | null>(null);
  const [caucusError, setCaucusError] = useState<string | null>(null);
  const [endorsementError, setEndorsementError] = useState<string | null>(null);
  const [foundName, setFoundName] = useState("");
  const [foundAbbr, setFoundAbbr] = useState("");
  const [foundError, setFoundError] = useState<string | null>(null);
  const [caucusName, setCaucusName] = useState("");
  const [caucusTaxRate, setCaucusTaxRate] = useState("0");
  const [joinErrors, setJoinErrors] = useState<Record<string, string>>({});
  const [joinCaucusErrors, setJoinCaucusErrors] = useState<Record<string, string>>({});

  const playerCountryParties = useMemo(() => {
    return Object.values(world.parties)
      .filter((p) => p.countryId === player.countryId)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [world.parties, player.countryId]);

  const joinableCaucuses = useMemo(() => {
    if (!player.partyId) return [];
    return world.caucuses.filter(
      (c) => c.disbandedAt === null && c.countryId === player.countryId && c.partyId === player.partyId && c.id !== player.caucusId,
    );
  }, [world.caucuses, player.countryId, player.partyId, player.caucusId]);

  const endorsementsInvolvingPlayer = useMemo(() => {
    return world.endorsements.filter((e) => e.endorserId === "player");
  }, [world.endorsements]);

  function refresh() {
    const w = game.getStateSync();
    if (w && onWorld) {
      onWorld({ ...w, meta: { ...w.meta }, player: { ...w.player, actionCooldowns: { ...w.player.actionCooldowns }, purgeRejoinBlocks: [...(w.player.purgeRejoinBlocks ?? [])] }, parties: { ...w.parties }, caucuses: [...w.caucuses], endorsements: [...w.endorsements], charters: [...w.charters] });
    }
  }

  function handleExecute(actionId: string, params: Record<string, unknown>, setError: (s: string | null) => void) {
    setError(null);
    const result = game.executeAction(actionId, params as never);
    if (result.ok) {
      if (onToast) onToast(result.message);
      refresh();
      return true;
    } else {
      setError(result.error);
      return false;
    }
  }

  const leaveEntry = ACTION_CATALOG.leaveParty;
  const joinEntry = ACTION_CATALOG.joinParty;
  const foundEntry = ACTION_CATALOG.foundParty;
  const createCaucusEntry = ACTION_CATALOG.createCaucus;
  const joinCaucusEntry = ACTION_CATALOG.joinCaucus;
  const leaveCaucusEntry = ACTION_CATALOG.leaveCaucus;
  const endorseEntry = ACTION_CATALOG.endorse;

  const leaveAp = getActionCost(leaveEntry, player.donorBaseLevel ?? 0, player.politicalInfluence ?? 0, player.favorability ?? 50);
  const joinAp = getActionCost(joinEntry, player.donorBaseLevel ?? 0, player.politicalInfluence ?? 0, player.favorability ?? 50);
  const foundAp = getActionCost(foundEntry, player.donorBaseLevel ?? 0, player.politicalInfluence ?? 0, player.favorability ?? 50);
  const createCaucusAp = getActionCost(createCaucusEntry, player.donorBaseLevel ?? 0, player.politicalInfluence ?? 0, player.favorability ?? 50);
  const joinCaucusAp = getActionCost(joinCaucusEntry, player.donorBaseLevel ?? 0, player.politicalInfluence ?? 0, player.favorability ?? 50);
  const leaveCaucusAp = getActionCost(leaveCaucusEntry, player.donorBaseLevel ?? 0, player.politicalInfluence ?? 0, player.favorability ?? 50);

  // Cooldown / purge state helpers
  const switchCooldownRemaining = (() => {
    const anchor = player.lastPartySwitchTurn;
    if (anchor == null) return 0;
    const rem = anchor + 24 - world.meta.turn;
    return rem > 0 ? rem : 0;
  })();
  const activePurgeBlocks = (player.purgeRejoinBlocks ?? []).filter((b) => b.purgedAtTurn + 24 > world.meta.turn);
  const purgeForParty = (partyId: string) => {
    const blk = activePurgeBlocks.find((b) => b.partyId === partyId && b.countryId === player.countryId);
    if (!blk) return 0;
    const rem = blk.purgedAtTurn + 24 - world.meta.turn;
    return rem > 0 ? rem : 0;
  };

  const roleNote = (() => {
    if (!party) return null;
    const tenure = player.partyJoinedTurn != null ? world.meta.turn - player.partyJoinedTurn : 0;
    const tenureStr = tenure === 0 ? "joined this turn" : `${tenure} turn${tenure === 1 ? "" : "s"} in party`;
    return `${party.tier === "major" ? "Major" : "Minor"} party · ${tenureStr}`;
  })();

  return (
    <div className="character-overlay" onClick={onClose}>
      <div className="character-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Character">
        <div className="character-head row spread">
          <span className="character-title">CHARACTER</span>
          <button className="secondary small-btn" onClick={onClose}>Close</button>
        </div>

        <div className="character-section">
          <h3>Identity</h3>
          <div className="character-row">
            <span className="character-label">Name</span>
            <span className="character-value">{player.name}</span>
          </div>
          <div className="character-row">
            <span className="character-label">Country</span>
            <span className="character-value">{countryName} ({player.countryId})</span>
          </div>
        </div>

        <div className="character-section">
          <h3>Party</h3>
          {party ? (
            <>
              <div className="character-party-card">
                <div className="row spread" style={{ alignItems: "center" }}>
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <span className="character-party-swatch" style={{ background: party.color ?? "#888" }} />
                    <strong>{party.name}</strong>
                    <span className="muted small">({party.abbreviation})</span>
                    <span className={`character-tier ${party.tier}`}>{party.tier}</span>
                  </div>
                  <IdeologyMarker econ={party.economicPosition} social={party.socialPosition} />
                </div>
                {roleNote && <div className="muted small">{roleNote}</div>}
                <div className="character-meta-grid">
                  <span className="muted small">Treasury</span><span>{formatNum(party.treasury)}</span>
                  <span className="muted small">Members</span><span>{party.memberCount}</span>
                  <span className="muted small">Ideology</span><span>econ {party.economicPosition} / social {party.socialPosition}</span>
                </div>
              </div>
              {(switchCooldownRemaining > 0 || activePurgeBlocks.length > 0) && (
                <div className="muted small character-note" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {switchCooldownRemaining > 0 && <span>Switch cooldown: {switchCooldownRemaining} turn(s) remaining (24-turn mainline guard)</span>}
                  {activePurgeBlocks.map((b) => {
                    const rem = b.purgedAtTurn + 24 - world.meta.turn;
                    return <span key={`${b.partyId}-${b.countryId}`}>Purge block: {b.partyId} banned for {rem} more turn(s)</span>;
                  })}
                </div>
              )}
              <div className="muted small">Leave cost: {costLabel(leaveEntry, leaveAp, leaveEntry.fundCost)}</div>
              {!leaveConfirm ? (
                <button className="secondary small-btn" onClick={() => { setPartyError(null); setLeaveConfirm(true); }}>Leave party</button>
              ) : (
                <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="muted small">Confirm leave?</span>
                  <button
                    className="small-btn"
                    onClick={() => {
                      const ok = handleExecute("leaveParty", {}, setPartyError);
                      if (ok) setLeaveConfirm(false);
                    }}
                  >
                    Confirm leave
                  </button>
                  <button className="secondary small-btn" onClick={() => setLeaveConfirm(false)}>Cancel</button>
                </div>
              )}
              {partyError && <div className="action-error" role="alert">{partyError}</div>}
            </>
          ) : (
            <>
              <div className="muted small">Unaffiliated. Join a party from your country or found a new one.</div>
              <div className="character-join-list">
                {playerCountryParties.map((p) => {
                  const purgeRem = purgeForParty(p.id);
                  const blockedByCooldown = switchCooldownRemaining > 0;
                  const blockedByPurge = purgeRem > 0;
                  return (
                    <div key={p.id} className="character-join-card">
                      <div className="row spread" style={{ alignItems: "center" }}>
                        <div className="row" style={{ gap: 8, alignItems: "center" }}>
                          <span className="character-party-swatch" style={{ background: p.color ?? "#888" }} />
                          <strong style={{ fontSize: 13 }}>{p.name}</strong>
                          <span className="muted small">({p.abbreviation})</span>
                          <span className={`character-tier ${p.tier}`}>{p.tier}</span>
                        </div>
                        <IdeologyMarker econ={p.economicPosition} social={p.socialPosition} />
                      </div>
                      <div className="character-meta-grid small">
                        <span className="muted small">Members</span><span className="muted small">{p.memberCount}</span>
                        <span className="muted small">Treasury</span><span className="muted small">{formatNum(p.treasury)}</span>
                      </div>
                      {(blockedByCooldown || blockedByPurge) && (
                        <div className="muted small" style={{ color: "#ffcc66", fontSize: 11 }}>
                          {blockedByPurge ? `Purge-blocked: ${purgeRem} turn(s) remaining` : `Cooldown: ${switchCooldownRemaining} turn(s) remaining`}
                        </div>
                      )}
                      <div className="row spread" style={{ alignItems: "center" }}>
                        <span className="muted small">Cost: {costLabel(joinEntry, joinAp, joinEntry.fundCost)}</span>
                        <button
                          className="secondary small-btn"
                          onClick={() => {
                            setJoinErrors((m) => ({ ...m, [p.id]: "" }));
                            const res = game.executeAction("joinParty", { partyId: p.id });
                            if (res.ok) {
                              if (onToast) onToast(res.message);
                              refresh();
                              setJoinErrors((m) => { const n = { ...m }; delete n[p.id]; return n; });
                            } else {
                              setJoinErrors((m) => ({ ...m, [p.id]: res.error }));
                            }
                          }}
                        >
                          Join
                        </button>
                      </div>
                      {joinErrors[p.id] && <div className="action-error" role="alert">{joinErrors[p.id]}</div>}
                    </div>
                  );
                })}
              </div>
              <div className="character-found">
                <h4>Found a new party</h4>
                <div className="muted small">Cost: {costLabel(foundEntry, foundAp, foundEntry.fundCost)} shown up front.</div>
                <label className="character-input-label">Name
                  <input value={foundName} onChange={(e) => setFoundName(e.target.value)} placeholder="New Frontier" />
                </label>
                <label className="character-input-label">Abbreviation
                  <input value={foundAbbr} onChange={(e) => setFoundAbbr(e.target.value)} placeholder="NFP" />
                </label>
                <button
                  className="secondary small-btn"
                  onClick={() => {
                    setFoundError(null);
                    const res = game.executeAction("foundParty", { foundPartyName: foundName, foundPartyAbbr: foundAbbr });
                    if (res.ok) {
                      if (onToast) onToast(res.message);
                      refresh();
                      setFoundName("");
                      setFoundAbbr("");
                    } else {
                      setFoundError(res.error);
                    }
                  }}
                >
                  Found party
                </button>
                {foundError && <div className="action-error" role="alert">{foundError}</div>}
              </div>
              {partyError && <div className="action-error" role="alert">{partyError}</div>}
            </>
          )}
        </div>

        <div className="character-section">
          <h3>Caucus</h3>
          {caucus ? (
            <>
              <div className="character-party-card">
                <div className="row spread">
                  <strong>{caucus.name}</strong>
                  <span className="muted small">{caucus.id}</span>
                </div>
                <div className="character-meta-grid">
                  <span className="muted small">Party</span><span>{caucus.partyId}</span>
                  <span className="muted small">Treasury</span><span>{formatNum(caucus.treasury)}</span>
                  <span className="muted small">Tax rate</span><span>{caucus.taxRate}%</span>
                  <span className="muted small">Members</span><span>{caucus.memberIds.length}</span>
                </div>
              </div>
              <div className="muted small">Leave cost: {costLabel(leaveCaucusEntry, leaveCaucusAp, leaveCaucusEntry.fundCost)}</div>
              {!leaveCaucusConfirm ? (
                <button className="secondary small-btn" onClick={() => { setCaucusError(null); setLeaveCaucusConfirm(true); }}>Leave caucus</button>
              ) : (
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span className="muted small">Confirm leave?</span>
                  <button className="small-btn" onClick={() => { const ok = handleExecute("leaveCaucus", {}, setCaucusError); if (ok) setLeaveCaucusConfirm(false); }}>Confirm leave</button>
                  <button className="secondary small-btn" onClick={() => setLeaveCaucusConfirm(false)}>Cancel</button>
                </div>
              )}
              {caucusError && <div className="action-error" role="alert">{caucusError}</div>}
            </>
          ) : !player.partyId ? (
            <div className="muted small">Join a party to create or join a caucus.</div>
          ) : (
            <>
              <div className="character-found">
                <h4>Create caucus</h4>
                <div className="muted small">Cost: {costLabel(createCaucusEntry, createCaucusAp, createCaucusEntry.fundCost)} shown up front.</div>
                <label className="character-input-label">Name
                  <input value={caucusName} onChange={(e) => setCaucusName(e.target.value)} placeholder="Progressive Caucus" />
                </label>
                <label className="character-input-label">Tax rate (0-5%)
                  <input value={caucusTaxRate} onChange={(e) => setCaucusTaxRate(e.target.value)} placeholder="0" />
                </label>
                <button
                  className="secondary small-btn"
                  onClick={() => {
                    setCaucusError(null);
                    const rate = Number(caucusTaxRate);
                    const res = game.executeAction("createCaucus", { caucusName, caucusTaxRate: Number.isFinite(rate) ? rate : 0 });
                    if (res.ok) {
                      if (onToast) onToast(res.message);
                      refresh();
                      setCaucusName("");
                    } else {
                      setCaucusError(res.error);
                    }
                  }}
                >
                  Create caucus
                </button>
                {caucusError && <div className="action-error" role="alert">{caucusError}</div>}
              </div>
              <div style={{ marginTop: 8 }}>
                <h4 style={{ margin: "8px 0 6px", fontSize: 12 }}>Join a caucus</h4>
                {joinableCaucuses.length === 0 ? (
                  <div className="muted small">No caucuses available in your party.</div>
                ) : (
                  <div className="character-join-list">
                    {joinableCaucuses.map((c) => (
                      <div key={c.id} className="character-join-card">
                        <div className="row spread"><strong style={{ fontSize: 13 }}>{c.name}</strong><span className="muted small">{c.taxRate}% tax</span></div>
                        <div className="muted small">Treasury {formatNum(c.treasury)} · Members {c.memberIds.length}</div>
                        <div className="row spread" style={{ alignItems: "center" }}>
                          <span className="muted small">Cost: {costLabel(joinCaucusEntry, joinCaucusAp, joinCaucusEntry.fundCost)}</span>
                          <button
                            className="secondary small-btn"
                            onClick={() => {
                              const res = game.executeAction("joinCaucus", { caucusId: c.id });
                              if (res.ok) { if (onToast) onToast(res.message); refresh(); setJoinCaucusErrors((m) => { const n = { ...m }; delete n[c.id]; return n; }); }
                              else setJoinCaucusErrors((m) => ({ ...m, [c.id]: res.error }));
                            }}
                          >Join</button>
                        </div>
                        {joinCaucusErrors[c.id] && <div className="action-error" role="alert">{joinCaucusErrors[c.id]}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="character-section">
          <h3>Endorsements</h3>
          <div className="muted small">Endorsements involving you as endorser. Active ones grant +3 support while in the same party.</div>
          {endorsementsInvolvingPlayer.length === 0 ? (
            <div className="muted small">No endorsements yet.</div>
          ) : (
            <ul className="character-endorsements">
              {endorsementsInvolvingPlayer.map((e) => {
                const targetName = (() => {
                  if (e.endorsedType === "party") return world.parties[e.endorsedId]?.name ?? e.endorsedId;
                  const pol = world.politicians.find((p) => p.id === e.endorsedId);
                  return pol ? pol.name : e.endorsedId;
                })();
                return (
                  <li key={e.id} className={`character-endorsement ${e.active ? "active" : "inactive"}`}>
                    <div className="row spread" style={{ alignItems: "center" }}>
                      <span style={{ fontSize: 13 }}><strong>{targetName}</strong> <span className="muted small">({e.endorsedType})</span></span>
                      <span className={`character-tier ${e.active ? "major" : ""}`} style={{ fontSize: 10 }}>{e.active ? "active" : "withdrawn"}</span>
                    </div>
                    <div className="muted small">Turn {e.turn} · {e.countryId} · {e.endorsedPartyId ? `party ${e.endorsedPartyId}` : "no party"} · +{e.supportBump} support</div>
                    <div className="muted small" style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{e.id}</div>
                  </li>
                );
              })}
            </ul>
          )}
          {endorsementError && <div className="action-error" role="alert">{endorsementError}</div>}
        </div>

        <div className="character-section">
          <h3>Resources</h3>
          <div className="character-row">
            <span className="character-label">Cash</span>
            <span className="character-value">{player.cash.toLocaleString("en-US")}</span>
          </div>
          <div className="character-row">
            <span className="character-label">Campaign funds</span>
            <span className="character-value">{(player.funds ?? 0).toLocaleString("en-US")}</span>
          </div>
          <div className="character-row">
            <span className="character-label">Action points</span>
            <span className="character-value">{player.actions ?? 0}</span>
          </div>
          <div className="muted small character-note">
            Refresh: +4 base (+ office bonus, consumes bonusActions) each turn, -4 hoard penalty above 100, cap 200. Source: src/lib/turn/actionRefresh.ts via engine actionRefreshPhase.
          </div>
          <div className="character-grid">
            <div className="character-stat">
              <span className="muted small">Donor base</span>
              <strong>{player.donorBaseLevel ?? 0}</strong>
            </div>
            <div className="character-stat">
              <span className="muted small">Influence</span>
              <strong>{(player.politicalInfluence ?? 0).toFixed(1)}</strong>
            </div>
            <div className="character-stat">
              <span className="muted small">Favorability</span>
              <strong>{player.favorability ?? 50}</strong>
            </div>
            <div className="character-stat">
              <span className="muted small">Infamy</span>
              <strong>{player.infamy ?? 0}</strong>
            </div>
          </div>
        </div>

        <div className="character-section">
          <h3>Cooldowns</h3>
          {Object.keys(player.actionCooldowns).length === 0 ? (
            <div className="muted small">No active cooldowns.</div>
          ) : (
            <ul className="character-cooldowns">
              {Object.entries(player.actionCooldowns).map(([id, readyAt]) => (
                <li key={id} className="character-cooldown">
                  <span>{id}</span>
                  <span className="muted small">{world.meta.turn < readyAt ? `ready at turn ${readyAt}` : "ready"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
