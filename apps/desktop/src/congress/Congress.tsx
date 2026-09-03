import { useMemo, useState } from "react";
import { getLaw, getCatalog } from "@ahdclient/engine";
import type { WorldState, Party, Bill, Committee } from "@ahdclient/engine";
import { game } from "../game.js";
import "./congress.css";

type Props = {
  world: WorldState;
  onWorld: (w: WorldState) => void;
  onToast: (msg: string) => void;
  onBack: () => void;
  initialCountryId?: string;
};

function safeStr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
function safeNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function humanStage(status: string): string {
  const map: Record<string, string> = {
    proposed: "Proposed",
    active: "Floor vote",
    active_other: "Second chamber",
    active_both: "Joint vote",
    enrolled: "Enrolled",
    vetoed: "Vetoed",
    veto_override: "Veto override",
    override_failed: "Override failed",
    signed: "Signed",
    failed: "Failed",
    withdrawn: "Withdrawn",
  };
  return map[status] ?? status;
}

function isHistoryStatus(s: string): boolean {
  return s === "signed" || s === "failed" || s === "withdrawn" || s === "override_failed";
}

function getTimer(bill: Bill, turn: number): { text: string; urgent: boolean } | null {
  if (bill.status === "proposed") return { text: "Awaiting activation", urgent: false };
  if (bill.status === "active" && bill.votingEndsOnTurn !== undefined) {
    const rem = bill.votingEndsOnTurn - turn;
    if (rem <= 0) return { text: "Voting closed", urgent: true };
    if (rem === 1) return { text: "1 turn left", urgent: rem <= 1 };
    return { text: `${rem} turns left`, urgent: false };
  }
  if (bill.status === "active_other" && bill.otherChamberVotingEndsOnTurn !== undefined) {
    const rem = bill.otherChamberVotingEndsOnTurn - turn;
    if (rem <= 0) return { text: "Voting closed", urgent: true };
    return { text: `${rem} turns left`, urgent: false };
  }
  if (bill.status === "active_both" && bill.votingEndsOnTurn !== undefined) {
    const rem = bill.votingEndsOnTurn - turn;
    return { text: `${rem} turns left`, urgent: rem <= 1 };
  }
  if (bill.status === "enrolled" && bill.presidentActionDeadlineOnTurn !== undefined) {
    const rem = bill.presidentActionDeadlineOnTurn - turn;
    if (rem <= 0) return { text: "Executive deadline passed", urgent: true };
    return { text: `${rem} turns to sign`, urgent: false };
  }
  if (bill.status === "veto_override" && bill.overrideVotingEndsOnTurn !== undefined) {
    const rem = bill.overrideVotingEndsOnTurn - turn;
    if (rem <= 0) return { text: "Override closed", urgent: true };
    return { text: `${rem} turns left`, urgent: false };
  }
  return null;
}

function committeeName(bill: Bill, committees: Committee[] | undefined): string | null {
  if (!bill.committeeId) return null;
  if (!committees) return bill.committeeId;
  const c = committees.find((x) => x.id === bill.committeeId);
  return c ? c.name : bill.committeeId;
}

function overallTally(bill: Bill): { for: number; against: number; abstain: number } | null {
  if (bill.voteSnapshot) return { for: bill.voteSnapshot.for, against: bill.voteSnapshot.against, abstain: bill.voteSnapshot.abstain };
  if (bill.otherChamberVoteSnapshot && bill.status === "active_other") return { for: bill.otherChamberVoteSnapshot.for, against: bill.otherChamberVoteSnapshot.against, abstain: bill.otherChamberVoteSnapshot.abstain };
  if (bill.status === "active" || bill.status === "proposed") {
    const f = safeNum(bill.votesFor, 0);
    const a = safeNum(bill.votesAgainst, 0);
    const ab = safeNum(bill.votesAbstain, 0);
    if (f + a + ab > 0) return { for: f, against: a, abstain: ab };
    const votes = bill.votes as Record<string, "for" | "against" | "abstain"> | undefined;
    if (votes && Object.keys(votes).length > 0) {
      let ff = 0, aa = 0, ab2 = 0;
      for (const v of Object.values(votes)) { if (v === "for") ff++; else if (v === "against") aa++; else ab2++; }
      return { for: ff, against: aa, abstain: ab2 };
    }
  }
  if (bill.otherChamberVotes && Object.keys(bill.otherChamberVotes).length > 0) {
    const tally = bill.otherChamberVoteSnapshot ?? null;
    if (tally) return { for: tally.for, against: tally.against, abstain: tally.abstain };
    let ff = 0, aa = 0, ab2 = 0;
    for (const v of Object.values(bill.otherChamberVotes)) { if (v === "for") ff++; else if (v === "against") aa++; else ab2++; }
    return { for: ff, against: aa, abstain: ab2 };
  }
  if (bill.vetoOverrideVotes && Object.keys(bill.vetoOverrideVotes).length > 0) {
    let ff = safeNum(bill.vetoOverrideVotesFor, 0);
    let aa = safeNum(bill.vetoOverrideVotesAgainst, 0);
    if (ff === 0 && aa === 0) {
      for (const v of Object.values(bill.vetoOverrideVotes as Record<string, string>)) { if (v === "for") ff++; else if (v === "against") aa++; }
    }
    return { for: ff, against: aa, abstain: 0 };
  }
  if (bill.overrideDisplaySnapshot) return { for: bill.overrideDisplaySnapshot.for, against: bill.overrideDisplaySnapshot.against, abstain: 0 };
  return null;
}

function partyBreakdown(
  voteMap: Record<string, string> | undefined,
  politicians: WorldState["politicians"] | undefined,
  playerPartyId: string | null,
  _playerName: string,
): Map<string, { for: number; against: number; abstain: number }> {
  const map = new Map<string, { for: number; against: number; abstain: number }>();
  if (!voteMap) return map;
  const polById = new Map<string, string>();
  if (Array.isArray(politicians)) {
    for (const p of politicians) polById.set(p.id, p.partyId);
  }
  for (const [voterId, vote] of Object.entries(voteMap)) {
    let partyId: string;
    if (voterId === "player") partyId = playerPartyId ?? "independent";
    else partyId = polById.get(voterId) ?? "unknown";
    const cur = map.get(partyId) ?? { for: 0, against: 0, abstain: 0 };
    if (vote === "for") cur.for++;
    else if (vote === "against") cur.against++;
    else cur.abstain++;
    map.set(partyId, cur);
  }
  return map;
}

function effectsPreview(catalogId: string | undefined): ReturnType<typeof getLaw> {
  if (!catalogId) return null;
  try { return getLaw(catalogId); } catch { return null; }
}

export function CongressScreen({ world, onWorld, onToast, onBack, initialCountryId }: Props) {
  const playerCountryId = safeStr((world as unknown as Record<string, unknown>)?.["player"] ? (world.player as unknown as Record<string, unknown>)["countryId"] as string : "", Object.keys((world as unknown as Record<string, unknown>)["countries"] as Record<string, unknown> ?? {})[0] ?? "US");
  const displayCountryId = initialCountryId ?? playerCountryId;
  const turn = safeNum((world as unknown as Record<string, unknown>)?.["meta"] ? (world.meta as unknown as Record<string, unknown>)["turn"] as number : 0, 0);
  const date = safeStr((world as unknown as Record<string, unknown>)?.["meta"] ? (world.meta as unknown as Record<string, unknown>)["date"] as string : "", "");

  const legislatures = (world as unknown as Record<string, unknown>)["legislatures"] as Record<string, { chambers: Array<{ key: string; name: string; elected: boolean; seats: number }> } > | undefined;
  const legislature = legislatures?.[displayCountryId];
  const electedChambers = useMemo(() => {
    if (!legislature?.chambers) return [];
    return legislature.chambers.filter((c) => c.elected);
  }, [legislature]);

  const bills = useMemo(() => {
    const raw = (world as unknown as Record<string, unknown>)["bills"];
    if (!Array.isArray(raw)) return [] as Bill[];
    return raw as Bill[];
  }, [world]);

  const committees = useMemo(() => {
    const raw = (world as unknown as Record<string, unknown>)["committees"];
    if (!Array.isArray(raw)) return [] as Committee[];
    return raw as Committee[];
  }, [world]);

  const countriesMap = (world as unknown as Record<string, unknown>)["countries"] as Record<string, Record<string, unknown>> | undefined;
  const countryName = safeStr(countriesMap?.[displayCountryId]?.["name"] as string, displayCountryId);

  const playerSeat = (world as unknown as Record<string, unknown>)?.["player"] ? ((world.player as unknown as Record<string, unknown>)["legislativeSeat"] as { chamberKey: string; countryId: string } | null | undefined) ?? null : null;
  const playerMode = safeStr((world as unknown as Record<string, unknown>)?.["player"] ? ((world.player as unknown as Record<string, unknown>)["mode"] as string) : "career", "career");
  const playerPartyId = ((world.player as unknown as Record<string, unknown>)["partyId"] as string | null | undefined) ?? null;
  const hasSeat = !!playerSeat;
  const seatGateReason = !hasSeat && playerMode !== "hos" ? "Must hold a legislative seat to sponsor bills (career mode); HoS mode grants government sponsorship" : null;

  const activeBills = useMemo(() => {
    return bills.filter((b) => {
      const cid = safeStr((b as unknown as Record<string, unknown>)["countryId"] as string, "");
      if (cid !== displayCountryId) return false;
      const status = safeStr((b as unknown as Record<string, unknown>)["status"] as string, "");
      return !isHistoryStatus(status);
    });
  }, [bills, displayCountryId]);

  const historyBills = useMemo(() => {
    const hist = bills.filter((b) => {
      const cid = safeStr((b as unknown as Record<string, unknown>)["countryId"] as string, "");
      if (cid !== displayCountryId) return false;
      const status = safeStr((b as unknown as Record<string, unknown>)["status"] as string, "");
      return isHistoryStatus(status);
    });
    hist.sort((a, b) => {
      const at = safeNum((a as unknown as Record<string, unknown>)["enactedAtTurn"] as number ?? (a as unknown as Record<string, unknown>)["failedAtTurn"] as number ?? (a as unknown as Record<string, unknown>)["updatedAtTurn"] as number, 0);
      const bt = safeNum((b as unknown as Record<string, unknown>)["enactedAtTurn"] as number ?? (b as unknown as Record<string, unknown>)["failedAtTurn"] as number ?? (b as unknown as Record<string, unknown>)["updatedAtTurn"] as number, 0);
      return bt - at;
    });
    return hist.slice(0, 20);
  }, [bills, displayCountryId]);

  const [selectedChamberKey, setSelectedChamberKey] = useState<string>(() => {
    if (playerSeat && electedChambers.some((c) => c.key === playerSeat.chamberKey)) return playerSeat.chamberKey;
    return electedChambers[0]?.key ?? "";
  });

  const filteredActive = useMemo(() => {
    if (!selectedChamberKey) return activeBills;
    return activeBills.filter((b) => {
      const status = safeStr((b as unknown as Record<string, unknown>)["status"] as string, "");
      const cur = safeStr((b as unknown as Record<string, unknown>)["currentChamber"] as string, "");
      const orig = safeStr((b as unknown as Record<string, unknown>)["originChamber"] as string, "");
      if (status === "proposed") return orig === selectedChamberKey;
      return cur === selectedChamberKey;
    });
  }, [activeBills, selectedChamberKey]);

  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const selectedBill = useMemo(() => {
    if (selectedBillId) {
      const found = bills.find((b) => b.id === selectedBillId);
      if (found) return found;
    }
    return filteredActive[0] ?? activeBills[0] ?? historyBills[0] ?? null;
  }, [bills, selectedBillId, filteredActive, activeBills, historyBills]);

  const [sponsorOpen, setSponsorOpen] = useState(false);
  const [sponsorError, setSponsorError] = useState<string | null>(null);
  const [sponsorBusy, setSponsorBusy] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  const catalogEntries = useMemo(() => {
    try {
      const entries = getCatalog(displayCountryId);
      return entries;
    } catch {
      return [];
    }
  }, [displayCountryId]);

  function refreshWorld() {
    const w = game.getStateSync();
    if (w) {
      onWorld({
        ...w,
        meta: { ...w.meta },
        player: { ...w.player, actionCooldowns: { ...w.player.actionCooldowns }, purgeRejoinBlocks: [...(w.player.purgeRejoinBlocks ?? [])] },
        parties: { ...w.parties },
        caucuses: [...w.caucuses],
        endorsements: [...w.endorsements],
        charters: [...w.charters],
        news: [...w.news],
        bills: [...(w.bills as unknown as Bill[])],
        committees: [...(w.committees as Committee[])],
      } as WorldState);
    }
  }

  const [taxRateInputs, setTaxRateInputs] = useState<Record<string, string>>({});
  function handleSponsor(catalogId: string) {
    setSponsorError(null);
    setSponsorBusy(catalogId);
    const rateStr = taxRateInputs[catalogId];
    const taxRate = rateStr !== undefined && rateStr !== "" && Number.isFinite(Number(rateStr)) ? Number(rateStr) : undefined;
    const result = game.executeAction("sponsorBill", { catalogId, ...(taxRate !== undefined ? { taxRate } : {}) } as unknown as Record<string, unknown>);
    setSponsorBusy(null);
    if (result.ok) {
      onToast(result.message);
      refreshWorld();
      setSponsorOpen(false);
    } else {
      setSponsorError(result.error);
    }
  }

  function handleVote(billId: string, vote: "for" | "against" | "abstain") {
    setVoteError(null);
    const result = game.executeAction("voteOnBill", { billId, vote } as unknown as Record<string, unknown>);
    if (result.ok) {
      onToast(result.message);
      refreshWorld();
    } else {
      setVoteError(result.error);
    }
  }

  const canVoteOnSelected = (() => {
    if (!selectedBill || !playerSeat) return false;
    const status = safeStr((selectedBill as unknown as Record<string, unknown>)["status"] as string, "");
    const cur = safeStr((selectedBill as unknown as Record<string, unknown>)["currentChamber"] as string, "");
    if (safeStr((selectedBill as unknown as Record<string, unknown>)["countryId"] as string, "") !== displayCountryId) return false;
    if (playerSeat.countryId !== displayCountryId) return false;
    if (playerSeat.chamberKey !== cur) return false;
    return status === "active" || status === "active_other" || status === "veto_override";
  })();

  const playerVotes = (() => {
    if (!selectedBill) return null;
    const status = safeStr((selectedBill as unknown as Record<string, unknown>)["status"] as string, "");
    if (status === "active_other") {
      const m = (selectedBill as unknown as Record<string, unknown>)["otherChamberVotes"] as Record<string, string> | undefined;
      return m?.["player"] ?? null;
    }
    if (status === "veto_override") {
      const m = (selectedBill as unknown as Record<string, unknown>)["vetoOverrideVotes"] as Record<string, string> | undefined;
      return m?.["player"] ?? null;
    }
    const m = (selectedBill as unknown as Record<string, unknown>)["votes"] as Record<string, string> | undefined;
    return m?.["player"] ?? null;
  })();

  return (
    <div className="congress-screen">
      <header className="congress-header">
        <div className="row spread">
          <div className="row" style={{ gap: 12 }}>
            <h1 className="congress-title">CONGRESS</h1>
            <span className="muted small congress-subtitle">
              {countryName} ({displayCountryId}) · Turn {turn} {date ? `· ${date}` : ""}
            </span>
          </div>
          <div className="row">
            <button className="secondary small-btn" onClick={onBack}>Back to dashboard</button>
          </div>
        </div>
        {electedChambers.length > 0 ? (
          <div className="congress-tabs" role="tablist" aria-label="Chambers">
            {electedChambers.map((ch) => {
              const active = ch.key === selectedChamberKey;
              return (
                <button
                  key={ch.key}
                  role="tab"
                  aria-selected={active}
                  className={`congress-tab elected ${active ? "active" : ""}`}
                  onClick={() => setSelectedChamberKey(ch.key)}
                >
                  {ch.name} · {ch.seats} seats
                </button>
              );
            })}
          </div>
        ) : (
          <div className="muted small" style={{ marginTop: 8 }}>No elected chambers for {displayCountryId}. Showing all bills.</div>
        )}
      </header>

      <div className="congress-layout">
        <div className="congress-list-col">
          <section className="panel congress-section">
            <div className="row spread" style={{ alignItems: "center" }}>
              <h2>Active bills · {filteredActive.length}</h2>
              <button className="secondary small-btn" onClick={() => setSponsorOpen((v) => !v)}>{sponsorOpen ? "Close picker" : "Sponsor bill"}</button>
            </div>

            {seatGateReason && (
              <div className="congress-gate-banner" role="note">{seatGateReason}</div>
            )}

            {sponsorOpen && (
              <div className="congress-pick-panel">
                <div className="muted small" style={{ marginBottom: 8 }}>Catalog picker · {catalogEntries.length} entries for {displayCountryId}. Available entries can be sponsored; stubbed entries are visible but grayed with blocking system.</div>
                {catalogEntries.length === 0 && <div className="muted small">No catalog entries for this country.</div>}
                <div className="congress-pick-grid">
                  {catalogEntries.map((entry) => {
                    const unavailable = entry.status === "unavailable";
                    return (
                      <div key={entry.id} className={`congress-pick-card ${unavailable ? "unavailable" : ""}`}>
                        <div className="congress-pick-head">
                          <span className="congress-pick-title">{entry.title}</span>
                          <span className={`congress-badge ${entry.status}`}>{entry.status}</span>
                        </div>
                        <div className="muted small">{entry.id} · {entry.category} · {entry.kind}</div>
                        <div className="muted small" style={{ lineHeight: 1.4 }}>{entry.description}</div>
                        {entry.status === "unavailable" && entry.blockingSystem && (
                          <div className="muted small" style={{ color: "#ff8a8a" }}>Blocked by {entry.blockingSystem} - PORT-STUB</div>
                        )}
                        <div className="muted small">Targets: {entry.targets.map((t) => t.metricId).join(", ") || "-"}</div>
                        <div className="row spread" style={{ alignItems: "center", marginTop: 4 }}>
                          <span className="muted small" style={{ fontFamily: "ui-monospace, monospace" }}>{entry.allowedScope}</span>
                          <button
                            className="secondary small-btn"
                            disabled={unavailable || !!sponsorBusy}
                            title={unavailable ? `Blocked by ${entry.blockingSystem ?? "unported system"}` : `Sponsor ${entry.id}`}
                            onClick={() => handleSponsor(entry.id)}
                          >
                            {sponsorBusy === entry.id ? "Sponsoring..." : unavailable ? "Unavailable" : "Sponsor"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {sponsorError && <div className="congress-inline-error" role="alert">{sponsorError}</div>}
                <div className="muted small" style={{ marginTop: 8 }}>Cost: 4 AP · cooldown 1 turn. Mutations go through the game module only.</div>
              </div>
            )}

            {filteredActive.length === 0 ? (
              <div className="congress-empty">
                <p className="muted">No active bills in this chamber.</p>
                <p className="muted small">Sponsor a bill from the catalog or advance turns for NPC bills to appear.</p>
              </div>
            ) : (
              <div className="congress-bill-list">
                {filteredActive.map((bill) => {
                  const timer = getTimer(bill as Bill, turn);
                  const cname = committeeName(bill as Bill, committees);
                  const status = safeStr((bill as unknown as Record<string, unknown>)["status"] as string, "");
                  const isSelected = selectedBill?.id === bill.id;
                  return (
                    <div
                      key={bill.id}
                      className={`congress-bill-card ${isSelected ? "active" : ""}`}
                      onClick={() => setSelectedBillId(bill.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedBillId(bill.id); }}
                    >
                      <div className="congress-bill-head">
                        <span className="congress-bill-title">{bill.title}</span>
                        <span className="congress-badge category">{bill.category}</span>
                      </div>
                      <div className="congress-bill-meta">
                        <span className="muted small">Sponsor: {bill.sponsorName}{bill.sponsorPartyId ? ` · ${bill.sponsorPartyId}` : ""}</span>
                        <span className="congress-badge">{humanStage(status)}</span>
                        <span className="muted small">{bill.currentChamber}</span>
                        {cname && <span className="congress-badge committee">{cname}</span>}
                      </div>
                      <div className="congress-bill-foot">
                        <span className="muted small" style={{ fontFamily: "ui-monospace, monospace" }}>{bill.id}</span>
                        {timer && <span className={`congress-timer ${timer.urgent ? "urgent" : ""}`}>{timer.text}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="panel congress-section">
            <h2>History · last 20</h2>
            {historyBills.length === 0 ? (
              <div className="congress-empty"><p className="muted small">No enacted or failed bills yet.</p></div>
            ) : (
              <div className="congress-history-list">
                {historyBills.map((bill) => {
                  const status = safeStr((bill as unknown as Record<string, unknown>)["status"] as string, "");
                  const enacted = status === "signed";
                  const cname = committeeName(bill as Bill, committees);
                  return (
                    <div
                      key={bill.id}
                      className={`congress-history-card ${enacted ? "enacted" : "failed"}`}
                      onClick={() => setSelectedBillId(bill.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedBillId(bill.id); }}
                    >
                      <div className="row spread" style={{ alignItems: "flex-start", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{bill.title}</span>
                        <span className="congress-badge" style={{ color: enacted ? "#2af57f" : "#ff8a8a", borderColor: enacted ? "#1a3a2a" : "#3a1f1f" }}>{enacted ? "enacted" : humanStage(status)}</span>
                      </div>
                      <div className="congress-bill-meta">
                        <span className="muted small">{bill.category} · {bill.sponsorName}</span>
                        {cname && <span className="congress-badge committee">{cname}</span>}
                        <span className="muted small">{safeNum((bill as unknown as Record<string, unknown>)["enactedAtTurn"] as number ?? (bill as unknown as Record<string, unknown>)["failedAtTurn"] as number, 0) ? `T${(bill as unknown as Record<string, unknown>)["enactedAtTurn"] ?? (bill as unknown as Record<string, unknown>)["failedAtTurn"]}` : `T${safeNum((bill as unknown as Record<string, unknown>)["updatedAtTurn"] as number, 0)}`}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="panel congress-section congress-detail-col">
          {!selectedBill ? (
            <div className="congress-empty"><p className="muted small">Select a bill to view details.</p></div>
          ) : (
            <div className="congress-detail">
              <div className="congress-detail-head">
                <h3>{selectedBill.title}</h3>
                <div className="muted small" style={{ lineHeight: 1.4 }}>{selectedBill.summary}</div>
                <div className="congress-bill-meta" style={{ marginTop: 8 }}>
                  <span className="congress-badge category">{selectedBill.category}</span>
                  <span className="congress-badge">{humanStage(safeStr((selectedBill as unknown as Record<string, unknown>)["status"] as string, ""))}</span>
                  <span className="muted small">{selectedBill.currentChamber} · origin {selectedBill.originChamber}</span>
                </div>
                <div className="muted small" style={{ marginTop: 6 }}>Sponsor: {selectedBill.sponsorName}{selectedBill.sponsorPartyId ? ` · ${selectedBill.sponsorPartyId}` : ""} · {selectedBill.id}</div>
                {(() => { const cn = committeeName(selectedBill as Bill, committees); return cn ? <div className="muted small">Committee: <span className="congress-badge committee">{cn}</span></div> : null; })()}
                {(() => { const t = getTimer(selectedBill as Bill, turn); return t ? <div style={{ marginTop: 8 }}><span className={`congress-timer ${t.urgent ? "urgent" : ""}`}>{t.text}</span></div> : null; })()}
              </div>

              <div>
                <h2>Stage history</h2>
                <ul className="congress-stage-list">
                  {[
                    { label: "Proposed", turn: safeNum((selectedBill as unknown as Record<string, unknown>)["proposedAtTurn"] as number, 0) },
                    ...(selectedBill.committeeId ? [{ label: `Committee referral${committeeName(selectedBill as Bill, committees) ? `: ${committeeName(selectedBill as Bill, committees)}` : ""}`, turn: safeNum((selectedBill as unknown as Record<string, unknown>)["committeeReferralTurn"] as number, 0) }] : []),
                    ...(selectedBill.votingEndsOnTurn !== undefined ? [{ label: `Origin vote ends`, turn: safeNum(selectedBill.votingEndsOnTurn, 0) }] : []),
                    ...(selectedBill.otherChamberVotingEndsOnTurn !== undefined ? [{ label: `Second chamber vote ends`, turn: safeNum(selectedBill.otherChamberVotingEndsOnTurn, 0) }] : []),
                    ...(selectedBill.presidentActionDeadlineOnTurn !== undefined ? [{ label: "Executive deadline", turn: safeNum(selectedBill.presidentActionDeadlineOnTurn, 0) }] : []),
                    ...(selectedBill.overrideVotingEndsOnTurn !== undefined ? [{ label: "Override vote ends", turn: safeNum(selectedBill.overrideVotingEndsOnTurn, 0) }] : []),
                    ...(selectedBill.enactedAtTurn !== undefined ? [{ label: "Enacted", turn: safeNum(selectedBill.enactedAtTurn, 0) }] : []),
                    ...(selectedBill.failedAtTurn !== undefined ? [{ label: "Failed", turn: safeNum(selectedBill.failedAtTurn, 0) }] : []),
                    { label: `Last updated`, turn: safeNum((selectedBill as unknown as Record<string, unknown>)["updatedAtTurn"] as number, 0) },
                  ].filter((s) => s.turn !== undefined && s.turn !== null).map((s, i) => {
                    const isCurrent = i === 0 && selectedBill.status === "proposed";
                    const isDone = turn >= s.turn;
                    return (
                      <li key={`${s.label}-${i}`} className="congress-stage-item">
                        <span className={`congress-stage-dot ${isDone ? "done" : isCurrent ? "current" : "pending"}`} />
                        <span style={{ flex: 1 }}>{s.label}</span>
                        <span className="muted small" style={{ fontFamily: "ui-monospace, monospace" }}>T{s.turn}</span>
                      </li>
                    );
                  })}
                  {Array.isArray((selectedBill as unknown as Record<string, unknown>)["filibusterInvocations"]) && ((selectedBill as unknown as Record<string, unknown>)["filibusterInvocations"] as Array<Record<string, unknown>>).length > 0 && (
                    <li className="congress-stage-item">
                      <span className="congress-stage-dot done" />
                      <span style={{ flex: 1 }}>Filibuster: {((selectedBill as unknown as Record<string, unknown>)["filibusterInvocations"] as Array<Record<string, unknown>>).map((f) => `${safeStr(f["characterName"] as string, "")} T${safeNum(f["invokedAtTurn"] as number, 0)}`).join(", ")}</span>
                    </li>
                  )}
                </ul>
              </div>

              <div className="congress-tally">
                <h2>Vote tallies</h2>
                {(() => {
                  const tally = overallTally(selectedBill as Bill);
                  if (!tally) return <div className="muted small">No votes cast yet. Tally appears after voting closes and snapshots are taken.</div>;
                  const total = tally.for + tally.against + tally.abstain;
                  const forPct = total ? (tally.for / total) * 100 : 0;
                  const againstPct = total ? (tally.against / total) * 100 : 0;
                  const abstainPct = total ? (tally.abstain / total) * 100 : 0;
                  const status = safeStr((selectedBill as unknown as Record<string, unknown>)["status"] as string, "");
                  const showOther = status === "active_other" || status === "enrolled" || status === "signed";
                  const voteMapForBreakdown = (() => {
                    if (status === "active_other") return (selectedBill as unknown as Record<string, unknown>)["otherChamberVotes"] as Record<string, string> | undefined;
                    if (status === "veto_override") return (selectedBill as unknown as Record<string, string> | undefined)?.["vetoOverrideVotes"] as unknown as Record<string, string> | undefined;
                    // fallback to origin votes
                    return (selectedBill as unknown as Record<string, unknown>)["votes"] as Record<string, string> | undefined;
                  })();
                  const breakdown = partyBreakdown(voteMapForBreakdown, (world as unknown as Record<string, unknown>)["politicians"] as WorldState["politicians"], playerPartyId, safeStr((world as unknown as Record<string, unknown>)?.["player"] ? (world.player as unknown as Record<string, unknown>)["name"] as string : "", ""));
                  const partiesForBreakdown = Object.values((world as unknown as Record<string, unknown>)["parties"] as Record<string, Party> ?? {}).filter((p) => p.countryId === displayCountryId).sort((a,b)=>a.id.localeCompare(b.id));
                  return (
                    <>
                      <div className="muted small" style={{ fontFamily: "ui-monospace, monospace" }}>Yea {tally.for} · Nay {tally.against} · Abstain {tally.abstain} {total ? `· total ${total}` : ""}</div>
                      <div className="congress-tally-overall" aria-label={`Yea ${tally.for} Nay ${tally.against} Abstain ${tally.abstain}`}>
                        {tally.for > 0 && <span className="congress-tally-seg for" style={{ width: `${forPct}%` }} title={`Yea ${tally.for}`} />}
                        {tally.against > 0 && <span className="congress-tally-seg against" style={{ width: `${againstPct}%` }} title={`Nay ${tally.against}`} />}
                        {tally.abstain > 0 && <span className="congress-tally-seg abstain" style={{ width: `${abstainPct}%` }} title={`Abstain ${tally.abstain}`} />}
                        {total === 0 && <span style={{ width: "100%", background: "#1a1a1a" }} />}
                      </div>
                      <div className="congress-tally-legend">
                        <span><span className="congress-swatch" style={{ background: "#2af57f" }} /> Yea</span>
                        <span><span className="congress-swatch" style={{ background: "#ff4d4d" }} /> Nay</span>
                        <span><span className="congress-swatch" style={{ background: "#8a8a8a" }} /> Abstain</span>
                      </div>
                      <div className="congress-party-bars">
                        {partiesForBreakdown.map((party) => {
                          const b = breakdown.get(party.id);
                          if (!b || (b.for + b.against + b.abstain === 0)) return null;
                          const tot = b.for + b.against + b.abstain;
                          const forW = tot ? (b.for / tot) * 100 : 0;
                          const againstW = tot ? (b.against / tot) * 100 : 0;
                          const abstainW = tot ? (b.abstain / tot) * 100 : 0;
                          return (
                            <div key={party.id} className="congress-party-row">
                              <span className="congress-party-name" title={party.name}>{party.abbreviation ?? party.id}</span>
                              <span className="congress-party-track">
                                {b.for > 0 && <span className="congress-tally-seg for" style={{ width: `${forW}%` }} />}
                                {b.against > 0 && <span className="congress-tally-seg against" style={{ width: `${againstW}%` }} />}
                                {b.abstain > 0 && <span className="congress-tally-seg abstain" style={{ width: `${abstainW}%` }} />}
                              </span>
                              <span className="muted small" style={{ fontFamily: "ui-monospace, monospace" }}>{b.for}/{b.against}/{b.abstain}</span>
                            </div>
                          );
                        })}
                        {Array.from(breakdown.entries()).filter(([k]) => !partiesForBreakdown.some((p)=>p.id===k)).map(([pid, b]) => {
                          const tot = b.for + b.against + b.abstain;
                          if (tot===0) return null;
                          const forW = (b.for / tot) * 100;
                          const againstW = (b.against / tot) * 100;
                          const abstainW = (b.abstain / tot) * 100;
                          return (
                            <div key={pid} className="congress-party-row">
                              <span className="congress-party-name">{pid}</span>
                              <span className="congress-party-track">
                                {b.for > 0 && <span className="congress-tally-seg for" style={{ width: `${forW}%` }} />}
                                {b.against > 0 && <span className="congress-tally-seg against" style={{ width: `${againstW}%` }} />}
                                {b.abstain > 0 && <span className="congress-tally-seg abstain" style={{ width: `${abstainW}%` }} />}
                              </span>
                              <span className="muted small" style={{ fontFamily: "ui-monospace, monospace" }}>{b.for}/{b.against}/{b.abstain}</span>
                            </div>
                          );
                        })}
                      </div>
                      {showOther && (() => {
                        const other = (selectedBill as unknown as Record<string, unknown>)["otherChamberVotes"] as Record<string, string> | undefined;
                        const otherSnap = (selectedBill as unknown as Record<string, unknown>)["otherChamberVoteSnapshot"] as { for: number; against: number; abstain: number } | undefined;
                        if (!other || Object.keys(other).length===0) return null;
                        const t = otherSnap ?? (() => { let f=0,a=0,ab=0; for(const v of Object.values(other)) if(v==="for") f++; else if(v==="against") a++; else ab++; return {for:f,against:a,abstain:ab}; })();
                        const tot2 = t.for + t.against + t.abstain;
                        return (
                          <div style={{ marginTop: 6 }}>
                            <div className="muted small" style={{ fontFamily: "ui-monospace, monospace" }}>Other chamber: Yea {t.for} · Nay {t.against} · Abstain {t.abstain} {tot2?`· total ${tot2}`:""}</div>
                          </div>
                        );
                      })()}
                      {(() => {
                        const snap = (selectedBill as unknown as Record<string, unknown>)["overrideDisplaySnapshot"] as unknown as { for: number; seats: number } | undefined;
                        if (!snap) return null;
                        return (
                          <div className="muted small" style={{ fontFamily: "ui-monospace, monospace" }}>
                            Override: Yea {snap.for ?? 0} · Seats {snap.seats ?? 0}
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
              </div>

              <div>
                <h2>Effects preview</h2>
                {(() => {
                  const catalog = effectsPreview((selectedBill as unknown as Record<string, unknown>)["legislationTypeId"] as string | undefined);
                  if (!catalog) {
                    return <div className="muted small">No catalog entry for this bill. Provisions: {(selectedBill.provisions ?? []).map((p) => `${p.type}${p.legislationTypeId ? ` ${p.legislationTypeId}` : ""}${p.effectDirection ? ` dir ${p.effectDirection}` : ""}`).join(", ") || "-"}</div>;
                  }
                  const isUnavailable = catalog.status === "unavailable";
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div className="row spread" style={{ alignItems: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{catalog.title}</span>
                        <span className={`congress-badge ${catalog.status}`}>{catalog.status}</span>
                      </div>
                      <div className="muted small" style={{ lineHeight: 1.4 }}>{catalog.description}</div>
                      <div className="muted small" style={{ fontFamily: "ui-monospace, monospace" }}>{catalog.id} · {catalog.category} · {catalog.kind} · {catalog.allowedScope}</div>
                      {catalog.targets.length > 0 && <div className="muted small">Targets: {catalog.targets.map((t) => `${t.metricId} (${t.weight})`).join(", ")}</div>}
                      {catalog.taxPolicy && (
                        <div className="muted small" style={{ fontFamily: "ui-monospace, monospace", display: "flex", gap: 8, alignItems: "center" }}>
                          <span>Tax: {catalog.taxPolicy.taxType} {catalog.taxPolicy.minRate} to {catalog.taxPolicy.maxRate} step {catalog.taxPolicy.step} baseline {catalog.taxPolicy.baselineRate}</span>
                          {!isUnavailable && (
                            <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                              target %
                              <input
                                type="number"
                                min={catalog.taxPolicy.minRate}
                                max={catalog.taxPolicy.maxRate}
                                step={catalog.taxPolicy.step}
                                value={taxRateInputs[catalog.id] ?? String(catalog.taxPolicy.baselineRate)}
                                onChange={(e) => setTaxRateInputs((m) => ({ ...m, [catalog.id]: e.target.value }))}
                                style={{ width: 72 }}
                              />
                            </label>
                          )}
                        </div>
                      )}
                      {catalog.blockingSystem && <div className="muted small" style={{ color: isUnavailable ? "#ff8a8a" : "inherit" }}>Blocking system: {catalog.blockingSystem}{isUnavailable ? " - PORT-STUB" : ""}</div>}
                      {catalog.effect?.economy && (
                        <div className="congress-effect-grid">
                          {Object.entries(catalog.effect.economy).map(([k, v]) => (
                            <div key={k} className="congress-effect-tile">
                              <div className="congress-effect-label">{k}</div>
                              <div className="congress-effect-value" style={{ color: (v as number) > 0 ? "#2af57f" : (v as number) < 0 ? "#ff8a8a" : "inherit" }}>{(v as number) > 0 ? "+" : ""}{(v as number).toString()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {catalog.effect?.partySupport && (
                        <div className="congress-effect-grid">
                          {Object.entries(catalog.effect.partySupport).map(([k, v]) => (
                            <div key={k} className="congress-effect-tile">
                              <div className="congress-effect-label">{k}</div>
                              <div className="congress-effect-value">{String(v)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {!catalog.effect?.economy && !catalog.effect?.partySupport && !catalog.taxPolicy && (
                        <div className="muted small">No direct solo effect descriptor; effect is narrative or via provisions.</div>
                      )}
                      {catalog.levels && (
                        <div className="muted small" style={{ lineHeight: 1.4 }}>
                          Levels: {catalog.levels.map((l) => l.name).join(" → ")}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div>
                <h2>Floor vote</h2>
                {!hasSeat ? (
                  <div className="congress-gate-banner">You hold no legislative seat. {seatGateReason ?? "Must hold a seat to vote."} {playerMode === "career" ? "Stand for election to gain a seat." : ""}</div>
                ) : !canVoteOnSelected ? (
                  <div className="muted small">
                    Voting is only available when the bill is at floor vote in your chamber.
                    {selectedBill && ` This bill is ${humanStage(safeStr((selectedBill as unknown as Record<string, unknown>)["status"] as string, ""))} in ${safeStr((selectedBill as unknown as Record<string, unknown>)["currentChamber"] as string, "")}; your seat is ${playerSeat.chamberKey}.`}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="muted small" style={{ fontFamily: "ui-monospace, monospace" }}>Your chamber: {playerSeat.chamberKey} · Your vote: {playerVotes ? (playerVotes === "for" ? "Yea" : playerVotes === "against" ? "Nay" : "Abstain") : "not yet cast"} · Cost: 1 AP</div>
                    <div className="congress-vote-actions">
                      {[
                        { v: "for" as const, label: "Yea" },
                        { v: "against" as const, label: "Nay" },
                        { v: "abstain" as const, label: "Abstain" },
                      ].map((opt) => (
                        <button
                          key={opt.v}
                          className={`secondary small-btn congress-vote-btn ${playerVotes === opt.v ? "selected" : ""}`}
                          onClick={() => handleVote(selectedBill.id, opt.v)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {voteError && <div className="congress-inline-error" role="alert">{voteError}</div>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
