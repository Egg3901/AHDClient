/**
 * Central bank types — solo port of src/lib/db/types/centralBank.ts (CentralBank
 * subset actually consumed by the ported cluster: npcBankPolicyTurn's real target
 * — the autonomous chair's Taylor-rule rate setter — plus chair term tracking).
 *
 * W3 scope: one bank per playable country (US/UK/RU/DD). Every bank is bootstrapped
 * directly in the autonomous technocrat mode (chairMode: "npp"): mainline seats a
 * character/player chair via presidential appointment (or Senate-confirmed FOMC
 * nomination for the US Fed), and only falls back to an NPP technocrat when no
 * candidate is available (src/lib/turn/centralBankChairSelection.ts, the
 * `appointNppChair` branch).
 *
 * W24 wires the appointment ATTRIBUTION half of this: `chairAppointedBy`
 * records the sitting president (if any) at each term-expiry rotation
 * (centralBank/phases.ts `centralBankChairChairSelectionPhase`), the same
 * field mainline's `chairAppointedBy` carries. What stays PORT-STUB is the
 * NOMINATION half — mainline's `nominations`/`lobbyingPool` pool of
 * player-characters the president chooses from. Rotunda has no candidate
 * pool separate from the single player + generated NPC roster to draw a
 * "nominee" from, so every bank's chair remains the autonomous NPP
 * technocrat regardless of whether a president is seated; the president's
 * only observable effect this wave is the attribution stamp. A real
 * nomination flow is blocked on a character-chair-candidate pool (and, for
 * the US, an FOMC board) — neither exists yet, and neither is scoped to
 * "presidential executive" specifically anymore now that W24 has landed.
 *
 * Fields mainline carries that solo omits (cited, not silently dropped):
 *  - chairCharacterId/chairCharacterName/chairAppointedAt, nominations,
 *    lobbyingPool, chairSelectionPending, chairControlsLocked: all part of
 *    the player/president NOMINATION apparatus — PORT-STUB, blocked on a
 *    character-chair-candidate pool (see above).
 *  - fomcBoard/activeFomcMeeting/fomcMeetingHistory/rateChangesThisTerm/
 *    fomcTermStartedAtTurn/lastFomcMeetingTurn/lastFomcVacancyNoticeAtTurn: the
 *    FOMC committee (US only) is staffed by presidential nomination + Senate
 *    confirmation and live player ballots — PORT-STUB, same blocker. Every
 *    solo bank (including US) runs the single-chair autonomous fallback path
 *    instead, which is exactly what mainline does whenever a board cannot
 *    carry a motion (src/lib/centralBank/fomc.ts boardCanCarryMotions) or has
 *    no nominee.
 *  - rateHistory (per-change audit log with changedBy/changedByName): needs a
 *    character to attribute the change to. interestRateHistory (turn/rate only)
 *    is kept — it drives the monetary-lag term in macroCountryTurn.
 *  - governmentControlled / bankReserveRequirement / forexRevenue / reserveBalance
 *    / monetaryOperations / treasuryTransferHistory / lobbying / credit-rating
 *    consumers: all belong to unported systems (private banking, forex, LOC,
 *    Treasury reserve transfers). Out of scope for W3.
 */

/** Per-turn interest-rate snapshot. Source: db/types/centralBank.ts TurnSnapshot. */
export interface CentralBankTurnSnapshot {
  turn: number;
  rate: number;
}

/** Source: db/types/centralBank.ts CentralBank (ported subset — see file doc). */
export interface CentralBank {
  countryId: string;
  /** Quarter-point-gridded policy rate. Source: db/types/centralBank.ts CentralBank.primeRate. */
  primeRate: number;
  /**
   * "npp" only in solo (autonomous technocrat chair). Source: CentralBank.chairMode.
   * Kept as a union rather than a bare literal so W24 can add "character" without
   * a further schema bump.
   */
  chairMode: "npp" | "character";
  /**
   * Hawk/dove temperament biasing the Taylor rule. Source: CentralBank.chairAlignment,
   * ChairAlignment (src/lib/centralBank/chairAlignment.ts). Null = neutral policy
   * (mainline's "absent" case — chairAlignmentPolicy(null) returns NEUTRAL_CHAIR_POLICY).
   */
  chairAlignment: "hawk" | "dove" | null;
  /** Chair scrutiny 0-100. Source: CentralBank.chairInfamy. */
  chairInfamy: number;
  /** Consecutive turns the corridor-correct stance has been held. Source: CentralBank.resolveStreak. */
  resolveStreak: number;
  /** Turn of the most recent executed rate move; null before the first move. Source: CentralBank.lastRateChangeTurn. */
  lastRateChangeTurn: number | null;
  /** Turn the current chair's term expires. Source: CentralBank.chairTermExpiresAtTurn (never null in solo — every bank is appointed at bootstrap). */
  chairTermExpiresAtTurn: number;
  /**
   * "player", a politician id, or null — the sitting president (if any) at
   * the chair's most recent appointment/rotation. Source: CentralBank.
   * chairAppointedBy. W24: attribution only (see file doc); does not change
   * chair SELECTION, which stays the autonomous NPP technocrat.
   */
  chairAppointedBy: string | null;
  /** Per-turn rate history, capped at 48 (1 game year). Source: CentralBank.interestRateHistory. */
  interestRateHistory: CentralBankTurnSnapshot[];
  /**
   * W12: the untracked NPC household money pool. Source: CentralBank.
   * externalBroadMoney — the central bank's counterparty for every NPC
   * deposit/loan flow in bankingTurn.ts (mainline's `bookCentralBankInterestCreation`
   * / deposit-flow legs). Absent from mainline's own seed path (it accrues
   * from the live economy over time); solo has no such accrual mechanism
   * feeding it turn over turn, so it is seeded once at world creation
   * proportional to the country's GDP (see world.ts seedCentralBanks) and
   * only ever drawn down/topped up by the banking cluster itself. PROVISIONAL
   * seed multiple — flagged for user review, same as every other banking
   * constant substituting for mainline's FX/history-anchored figures.
   */
  externalBroadMoney: number;
}
