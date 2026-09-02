/**
 * Action catalog.
 * Ports src/lib/actions.ts ActionDefinition + costs + fundraise quote logic
 * (actions.fundraiseQuote) at mainline-neutral values. Each entry lists cost,
 * cooldown, fund cost, and target system. Entries whose blocking system is not
 * yet ported get PORT-STUB unavailable status so UI can gray them out honestly.
 *
 * Deterministic pure definitions; no RNG.
 */

import { fundraiseYield } from "./fundGeneration.js";

export type ActionId =
  | "buyBond"
  | "sellBond"
  | "fundraise"
  | "campaign"
  | "advertise"
  | "buildDonorBase"
  | "poll"
  | "pollLarge"
  | "convertCash"
  | "rest"
  | "canvass"
  | "organize"
  | "pressureBoost"
  | "investInfluence"
  | "joinParty"
  | "leaveParty"
  | "foundParty"
  | "createCaucus"
  | "joinCaucus"
  | "leaveCaucus"
  | "endorse"
  | "sponsorBill"
  | "voteOnBill"
  | "repealLaw"
  | "invokeFilibuster"
  | "declareCandidacy"
  | "withdrawCandidacy"
  | "contestPartyLeadership"
  | "votePartyLeadership"
  | "contestCommittee"
  | "voteCommittee"
  | "createCoalition"
  | "joinCoalition"
  | "initiateCoalitionDisband"
  | "voteCoalitionDisband"
  | "buyShares"
  | "sellShares"
  | "crisisBailout"
  | "crisisStimulus"
  | "crisisRespond"
  | "crisisMonitor"
  // M1 (Lane 12 Head of State mode) economic-direction levers: HoS-only,
  // call existing budget pure functions (budget/spending.ts, budget/revenue.ts),
  // never new phase logic. See actions/execute.ts for the mode gate.
  | "adjustBudgetSpending"
  | "adjustTaxRate"
  | "setSubsidyRate"
  | "commandEconomyDirective"
  // W11 extraction/prospecting
  | "launchProspect"
  | "issueExtractionContract"
  // W35 player wealth: savings + wires
  | "depositSavings"
  | "withdrawSavings"
  | "moveSavings"
  | "wireTransfer";

// Costs mirror mainline's dynamic tier functions but collapsed to neutral
// goldens for solo's simpler state (no per-state GDP tier). Cited.
export interface ActionCatalogEntry {
  id: ActionId;
  name: string;
  description: string;
  /** Action-point cost (before influence/favorability tier overrides) */
  baseCost: number;
  /** Cooldown in turns after execution before next available */
  cooldown: number;
  /** Fund cost flat (before scaling); 0 means no treasury check */
  fundCost: number;
  /** Target system(s) this action touches */
  systems: string[];
  /** Whether the action is available given ported systems */
  status: "available" | "unavailable";
  /** When unavailable, which blocking system is named */
  blockingSystem?: string;
  /** Compute dynamic cost for an actor's current stats (for UI quote) */
  quotedActionCost?: (donorBaseLevel: number, politicalInfluence: number, favorability: number) => number;
  /** Fundraise quote helper: actions.fundraiseQuote per brief */
  fundraiseQuote?: (donorBaseLevel: number, politicalInfluence: number) => number;
}

// Dynamic helpers ported from src/lib/actions.ts (neutral values)
function campaignActionCost(politicalInfluence: number): number {
  const v = Math.max(0, Math.min(100, politicalInfluence));
  if (v >= 80) return 5;
  if (v >= 60) return 4;
  if (v >= 40) return 3;
  if (v >= 20) return 2;
  return 1;
}

function advertiseActionCost(favorability: number): number {
  const v = Math.max(0, Math.min(100, favorability));
  if (v >= 85) return 9;
  if (v >= 70) return 8;
  if (v >= 50) return 7;
  if (v >= 30) return 6;
  return 5;
}

function donorActionCost(donorBaseLevel: number, action: "fundraise" | "buildDonorBase"): number {
  if (action === "fundraise") return 3;
  return Math.min(20, Math.round(4 + Math.pow(donorBaseLevel / 75, 1.4) * 16));
}

export const ACTION_CATALOG: Record<ActionId, ActionCatalogEntry> = {
  // W13 bonds: player buy/sell sovereign bond units at mainline pricing (marketPrice × face).
  // Ports src/app/api/bonds/[bondId]/buy+ sell (bondHolderOps reserveBondUnitsForHolder) at neutral fee — solo has no brokerage/markup, same as W10's share trade.
  buyBond: {
    id: "buyBond",
    name: "Buy Bond",
    description: "Buy sovereign bond units from the public float at the current market price. Cost = units × faceValue × marketPrice. Ports bonds purchase at mainline pricing (BOND_UNIT_FACE_VALUE × marketPrice).",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["bonds"],
    status: "available",
  },
  sellBond: {
    id: "sellBond",
    name: "Sell Bond",
    description: "Sell sovereign bond units back into the public float at the current market price. Proceeds = units × faceValue × marketPrice.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["bonds"],
    status: "available",
  },
  // PORT-STUB: forex-denominated bond issuance (cross-currency sovereign float) requires FX system.
  // Visible as unavailable so the UI can gray it out with a named blocker rather than invent a rate.
  // Source: sovereign.ts currencyCode via resolveCountryCurrencyCode (needs FX for cross-currency settlement).
  // Blocked: forex
  // Corporate-bond issuance is also stubbed: needs corporation credit + bondHolderOps corporate path.
  // Blocked: corporateBondIssuance
  fundraise: {
    id: "fundraise",
    name: "Fundraise",
    description: "Raise campaign funds from your donor base. Yield scales with donor base and influence per actions.fundraiseQuote.",
    baseCost: 3,
    cooldown: 0,
    fundCost: 0,
    systems: ["funds"],
    status: "available",
    quotedActionCost: (donor: number) => donorActionCost(donor, "fundraise"),
    fundraiseQuote: (donor, influence) => fundraiseYield(donor, influence),
  },
  campaign: {
    id: "campaign",
    name: "Campaign",
    description: "Increase political influence and candidate support. Cost scales with influence tier.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 20000,
    systems: ["support", "partyInfluence"],
    status: "available",
    quotedActionCost: (_donor, influence) => campaignActionCost(influence),
  },
  advertise: {
    id: "advertise",
    name: "Run Advertisements",
    description: "Boost favorability via ads. Fund cost scales with favorability tier.",
    baseCost: 5,
    cooldown: 1,
    fundCost: 100_000,
    systems: ["favorability"],
    status: "available",
    quotedActionCost: (_donor, _inf, fav) => advertiseActionCost(fav),
  },
  buildDonorBase: {
    id: "buildDonorBase",
    name: "Build Donor Network",
    description: "Expand donor base; increases future fundraise yield and generation.",
    baseCost: 4,
    cooldown: 0,
    fundCost: 3000,
    systems: ["donorBase"],
    status: "available",
    quotedActionCost: (donor) => donorActionCost(donor, "buildDonorBase"),
  },
  poll: {
    id: "poll",
    name: "Quick Poll",
    description: "Commission a quick poll. No persistent world effect in solo yet.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 25_000,
    systems: ["polling"],
    status: "unavailable",
    blockingSystem: "polling/election polling",
  },
  pollLarge: {
    id: "pollLarge",
    name: "Full Demographic Poll",
    description: "Comprehensive poll with full breakdown. No persistent effect yet.",
    baseCost: 6,
    cooldown: 1,
    fundCost: 75_000,
    systems: ["polling"],
    status: "unavailable",
    blockingSystem: "polling/election polling",
  },
  convertCash: {
    id: "convertCash",
    name: "Personal Campaign Donation",
    description: "Convert personal cash to campaign funds at 50% (infamy scales with amount).",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["cash", "funds", "infamy"],
    status: "available",
  },
  rest: {
    id: "rest",
    name: "Rest",
    description: "Take a break. No effect.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: [],
    status: "available",
  },
  canvass: {
    id: "canvass",
    name: "Canvass",
    description: "GOTV canvass: boost turnout modifiers in a target region.",
    baseCost: 3,
    cooldown: 0,
    fundCost: 15000,
    systems: ["GOTV/turnout"],
    status: "available",
  },
  organize: {
    id: "organize",
    name: "Organize",
    description: "Build regional organization for your party in a target region.",
    baseCost: 4,
    cooldown: 0,
    fundCost: 10000,
    systems: ["org/partyRegions"],
    status: "available",
  },
  pressureBoost: {
    id: "pressureBoost",
    name: "Apply Pressure",
    description: "Increase political pressure for your party in a region.",
    baseCost: 3,
    cooldown: 0,
    fundCost: 8000,
    systems: ["pressure/partyPressures"],
    status: "available",
  },
  investInfluence: {
    id: "investInfluence",
    name: "Invest Party Influence",
    description: "Spend accumulated party influence to gain bonus actions.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["partyInfluence"],
    status: "available",
  },
  joinParty: {
    id: "joinParty",
    name: "Join Party",
    description: "Join a political party. Requires 24-turn switch cooldown and no purge block. Costs 2 AP. Cites src/lib/parties/antiAbuseGuards.ts PARTY_SWITCH_COOLDOWN_MS 24h -> 24 turns and PURGE_REJOIN_COOLDOWN_TURNS=24.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["party/membership"],
    status: "available",
  },
  leaveParty: {
    id: "leaveParty",
    name: "Leave Party",
    description: "Leave current party and become independent. Clears caucus membership and withdraws misaligned endorsements per src/app/api/country/[code]/parties/[id]/leave/route.ts.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["party/membership"],
    status: "available",
  },
  foundParty: {
    id: "foundParty",
    name: "Found Party",
    description: "Found a new party via charter machinery (W18). Creates a Party row + ratified Charter, auto-joins founder. Cost 8 AP + 100k funds. Cites src/lib/charters/draftCharter.ts + ratifyCharter.ts and CHARTER_DEADLINE_TURNS=14.",
    baseCost: 8,
    cooldown: 0,
    fundCost: 100_000,
    systems: ["party/charter"],
    status: "available",
  },
  createCaucus: {
    id: "createCaucus",
    name: "Create Caucus",
    description: "Create a caucus inside your current party. Requires party membership, caucusId null. Cost 4 AP + 25k funds, taxRate 0-5% per src/lib/db/types/caucus.ts.",
    baseCost: 4,
    cooldown: 0,
    fundCost: 25_000,
    systems: ["caucus"],
    status: "available",
  },
  joinCaucus: {
    id: "joinCaucus",
    name: "Join Caucus",
    description: "Join an existing caucus in your party. Requires same party, not already in a caucus. Cost 2 AP per src/app/api/country/[code]/parties/[id]/caucuses/[slug]/members/route.ts.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["caucus"],
    status: "available",
  },
  leaveCaucus: {
    id: "leaveCaucus",
    name: "Leave Caucus",
    description: "Leave current caucus. Cost 1 AP.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["caucus"],
    status: "available",
  },
  endorse: {
    id: "endorse",
    name: "Endorse",
    description: "Endorse a party or politician. Active endorsement gives +3 support to candidateSupports (SUPPORT_ENDORSEMENT_BUMP=3 per src/lib/electionEngine/electionFormulaFactors.ts). Sweep withdraws cross-party endorsements on switch.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["endorsement/support"],
    status: "available",
  },
  sponsorBill: {
    id: "sponsorBill" as ActionId,
    name: "Sponsor Bill",
    description: "Sponsor a bill from the legislation catalog. Requires holding a legislative seat (career) or government sponsorship (HoS). Cost 4 AP. Ports src/lib/congress/billProposal.ts seat gate and catalog validation.",
    baseCost: 4,
    cooldown: 1,
    fundCost: 0,
    systems: ["legislation/bills"],
    status: "available",
  },
  voteOnBill: {
    id: "voteOnBill" as ActionId,
    name: "Vote on Bill",
    description: "Cast a vote on an active bill in your chamber. Requires holding a seat in the bill's current chamber. Cost 1 AP. Ports bill voting chamber scope.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["legislation/voting"],
    status: "available",
  },
  repealLaw: {
    id: "repealLaw" as ActionId,
    name: "Repeal Law",
    description: "Propose repeal of an enacted law. Requires holding a seat; creates a repeal bill. Ports mainline expiry/repeal model.",
    baseCost: 4,
    cooldown: 1,
    fundCost: 0,
    systems: ["legislation/repeal"],
    status: "available",
  },
  invokeFilibuster: {
    id: "invokeFilibuster" as ActionId,
    name: "Invoke Filibuster",
    description: "Invoke filibuster on a senate bill, raising bar to 3/5 of votes cast (quorum rule). Costs 2 AP. Ports didPassWithFilibusterCheck.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["legislation/cloture"],
    status: "available",
  },
  declareCandidacy: {
    id: "declareCandidacy",
    name: "Declare Candidacy",
    description: "File for an open or upcoming race in your country. Party ballot line; one active candidacy at a time.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0, // PORT-STUB: mainline filing fee not yet ported
    systems: ["elections"],
    status: "available",
  },
  withdrawCandidacy: {
    id: "withdrawCandidacy",
    name: "Withdraw Candidacy",
    description: "Withdraw from a race before it resolves.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["elections"],
    status: "available",
  },
  contestPartyLeadership: {
    id: "contestPartyLeadership",
    name: "Contest Party Leadership",
    description: "Enter a state or national party leadership race (chair/viceChair/treasurer) for your current party. Ports src/lib/statePartyElections.ts and src/lib/nationalPartyElections.ts candidacy entry (24h cooldown and party tenure gates are PORT-STUB with infamy 0). Cost 2 AP. Where mainline gates on human entry, NPCs are auto-entered by phase.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["intraparty/partyElections"],
    status: "available",
  },
  votePartyLeadership: {
    id: "votePartyLeadership",
    name: "Vote in Party Leadership Election",
    description: "Cast ballot in a state or national party leadership election for your party. Single-choice per election. Ports StatePartyVote/NationalPartyVote ballot. NPC votes use NPP ballot logic per src/lib/turn/nppVoteLogic.ts calculateBaseVote (loyalty->abstain, ideology proximity). Cost 1 AP.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["intraparty/partyElections"],
    status: "available",
  },
  contestCommittee: {
    id: "contestCommittee",
    name: "Contest Committee Seat",
    description: "Enter the national committee election for your party (6 seats, up to 6 votes per voter). Ports src/lib/nationalCommitteeElections.ts COMMITTEE_SIZE=6, MAX_VOTES_PER_VOTER=6.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["intraparty/committee"],
    status: "available",
  },
  voteCommittee: {
    id: "voteCommittee",
    name: "Vote in Committee Election",
    description: "Cast ballot for up to 6 candidates in a committee election. Ports NationalCommitteeVote candidateIds tally. NPC votes by ballot.ts pickCommitteeCandidatesForVoter (NPP logic). Cost 1 AP.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["intraparty/committee"],
    status: "available",
  },
  createCoalition: {
    id: "createCoalition",
    name: "Create Coalition",
    description: "Found a coalition with your current party as lead. Ports src/lib/coalitions/types.ts Coalition + creation. Cost 3 AP.",
    baseCost: 3,
    cooldown: 0,
    fundCost: 0,
    systems: ["coalition"],
    status: "available",
  },
  joinCoalition: {
    id: "joinCoalition",
    name: "Join Coalition",
    description: "Join an existing coalition with your current party. Ports CoalitionMember join flow.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["coalition"],
    status: "available",
  },
  initiateCoalitionDisband: {
    id: "initiateCoalitionDisband",
    name: "Initiate Coalition Disband Vote",
    description: "Start a majority disband vote in your coalition. Expires in 168 turns; threshold floor(n/2)+1 per src/lib/turn/coalitionDisbandCheck.ts. Cost 2 AP.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["coalition/disband"],
    status: "available",
  },
  voteCoalitionDisband: {
    id: "voteCoalitionDisband",
    name: "Vote on Coalition Disband",
    description: "Cast yes/no on an active coalition disband vote. One vote per member party, majority wins. Ports coalitionDisbandCheck majority logic.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["coalition/disband"],
    status: "available",
  },
  // W10 markets. No AP/fund-tier cost: mainline's buyPublicShares/
  // sellPublicShares are plain API calls gated only by cash/float/treasury,
  // not the political action-point economy — baseCost/fundCost stay 0 and
  // the real cost (shares * corp.sharePrice, no brokerage fee — see
  // market/constants.ts) is checked directly in execute.ts against
  // params.shares and the target corp. Listed here anyway (per the wave
  // brief) so buy/sell shares up through the same typed catalog/execute
  // surface every other action does, for a consistent UI dispatch path.
  buyShares: {
    id: "buyShares",
    name: "Buy Shares",
    description: "Buy shares from a corporation's public float at the current market price. Cost = shares x sharePrice, credited to the issuing corporation's own treasury (mainline's treasury-backed market maker, buyPublicShares.ts).",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["market"],
    status: "available",
  },
  sellShares: {
    id: "sellShares",
    name: "Sell Shares",
    description: "Sell shares back into a corporation's public float at the current market price. Proceeds are paid from the issuing corporation's own treasury (buyback), capped by what it can cover — sellPublicShares.ts.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["market"],
    status: "available",
  },
  // ── W31 crisis action hooks ─────────────────────────────────────
  // Crisis responses where mainline gives players crisis interaction decision
  // trees (src/lib/crises/interactionEngine.ts + templates.ts decisionTree).
  // In solo, each active crisis can be responded to once via a costed action;
  // the optionActions hook (crisisResponseOptions in events/crisis.ts) runs
  // the chosen response's effect (shorten duration, treasury cost). These
  // actions are gated on an active crisis for the player's country — when
  // none is active they are available but no-op (same as mainline's
  // interactionEngine autoResolveOnExpiry fallback). Source: src/lib/crises/optionActions.ts
  crisisBailout: {
    id: "crisisBailout",
    name: "Authorize Crisis Bailout",
    description: "Inject treasury funds to shorten an active banking crisis by 3 turns. Ports crisis.bankingCrisis bailout_yes option (costs 2% GDP). Requires active crisis for player's country; otherwise no-op.",
    baseCost: 4,
    cooldown: 1,
    fundCost: 20000,
    systems: ["crisis"],
    status: "available",
  },
  crisisStimulus: {
    id: "crisisStimulus",
    name: "Pass Crisis Stimulus",
    description: "Stimulus package to shorten an active recession by 2 turns. Ports crisis.recession stimulus_moderate option (costs 1.5% GDP). Requires active crisis for player's country; otherwise no-op.",
    baseCost: 4,
    cooldown: 1,
    fundCost: 15000,
    systems: ["crisis"],
    status: "available",
  },
  crisisRespond: {
    id: "crisisRespond",
    name: "Coordinate Crisis Response",
    description: "Generic crisis response: mobilize government to shorten any active crisis by 1 turn. Ports crisis interaction generic fallback (W34 action catalog hook).",
    baseCost: 3,
    cooldown: 1,
    fundCost: 5000,
    systems: ["crisis"],
    status: "available",
  },
  crisisMonitor: {
    id: "crisisMonitor",
    name: "Monitor Crisis",
    description: "Take no direct action on the active crisis. No cost beyond 1 AP, crisis runs its course. Ports crisis interaction wait/decline option.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["crisis"],
    status: "available",
  },
  // ── M1 economic-direction levers (Lane 12 Head of State mode) ─────
  // HoS-only (execute.ts gates on player.mode === "hos"); each real lever
  // below calls an existing pure budget function (budget/spending.ts
  // calculateBudgetSpending, budget/revenue.ts calculateBudgetRevenue) —
  // no new phase logic, mirrors the crisis actions' pattern of a costed
  // action wrapping an existing calculation. Unported levers stay
  // "unavailable" with a named blocker so the HoS UI can gray them out
  // honestly instead of pretending the dial exists.
  adjustBudgetSpending: {
    id: "adjustBudgetSpending",
    name: "Direct Spending",
    description: "Set a federal budget spending category to a new absolute value; recomputes budget.spending and surplus via calculateBudgetSpending. HoS mode only — country-level fiscal authority, not a party action. Cost 3 AP.",
    baseCost: 3,
    cooldown: 0,
    fundCost: 0,
    systems: ["budget"],
    status: "available",
  },
  adjustTaxRate: {
    id: "adjustTaxRate",
    name: "Set Tax Rate",
    description: "Set a federal tax rate (0-100%); recomputes budget.revenue and surplus via calculateBudgetRevenue. HoS mode only. Cost 3 AP.",
    baseCost: 3,
    cooldown: 0,
    fundCost: 0,
    systems: ["budget"],
    status: "available",
  },
  // PORT-STUB: subsidyBudget.ts calculateSubsidyCost is wired to sector
  // revenues that do not exist yet in this branch (corporation/sector
  // subsidy costing is still 0 by construction — see that file's doc).
  // Listed (not omitted) so the HoS Economic Direction console can render
  // an honest grayed-out row naming the real blocker instead of hiding the
  // lever the roadmap promises.
  setSubsidyRate: {
    id: "setSubsidyRate",
    name: "Set Subsidy Rate",
    description: "Sector subsidy dial. Blocked: subsidyBudget.ts calculateSubsidyCost has no live sector/corporation revenue input yet (PORT-STUB, always resolves to 0).",
    baseCost: 3,
    cooldown: 0,
    fundCost: 0,
    systems: ["budget/subsidies"],
    status: "unavailable",
    blockingSystem: "corporation/sector subsidies (subsidyBudget.ts PORT-STUB)",
  },
  // PORT-STUB: commandEconomy/* (W7) has not merged into this branch as of
  // this wave (batch-econ, schema v34, still on its own worktree) — no
  // mutable command-economy state exists here to call into yet.
  commandEconomyDirective: {
    id: "commandEconomyDirective",
    name: "Command Economy Directive",
    description: "State-directed production/allocation dial. Blocked: W7 command economy has not merged into this branch yet — no commandEconomy module exists to call.",
    baseCost: 3,
    cooldown: 0,
    fundCost: 0,
    systems: ["commandEconomy"],
    status: "unavailable",
    blockingSystem: "commandEconomy (W7, not yet merged)",
  },
  // ── W11 extraction/prospecting ──────────────────────────────────
  // Government (HoS-mode) actions only — see extraction/prospecting.ts and
  // extraction/contracts.ts file docs for the state-level/issuer-authority
  // PORT-STUBs. fundCost is 0: cost is paid from the country treasury
  // (world.budgets), not the player's personal campaign funds, so it is
  // charged directly in execute.ts rather than through the generic fundCost
  // gate (same pattern crisisBailout's treasury-costed sibling actions do
  // NOT use — those DO use fundCost/actor.funds; extraction cost instead
  // comes out of the country's treasuryBalance, which can go negative/borrow
  // like every other government spend in this codebase).
  launchProspect: {
    id: "launchProspect",
    name: "Commission Geological Survey",
    description: "Launch a national government geological survey for a resource in a region. Cost escalates with prior successes there. Requires Head of State mode. Ports src/lib/extraction/commands/launchGovernmentProspect.ts (national level only).",
    baseCost: 3,
    cooldown: 0,
    fundCost: 0,
    systems: ["extraction/prospecting"],
    status: "available",
  },
  issueExtractionContract: {
    id: "issueExtractionContract",
    name: "Issue Extraction Contract",
    description: "Offer an extraction contract to your country's extraction corporation for a resource/region: share, royalty rate, term, and signing fee. Requires Head of State mode. Ports src/lib/extraction/commands/issueContractOffer.ts (national level only).",
    baseCost: 3,
    cooldown: 0,
    fundCost: 0,
    systems: ["extraction/contracts"],
    status: "available",
  },
  // ── W35 player wealth: savings + wires ──────────────────────────
  depositSavings: {
    id: "depositSavings",
    name: "Deposit to Savings",
    description: "Move personal cash into your savings balance. Ports src/app/api/character/savings/deposit/route.ts core balance move.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["finance/savings"],
    status: "available",
  },
  withdrawSavings: {
    id: "withdrawSavings",
    name: "Withdraw from Savings",
    description: "Move savings back into personal cash. Ports the withdraw sibling of the deposit route.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["finance/savings"],
    status: "available",
  },
  moveSavings: {
    id: "moveSavings",
    name: "Move Savings Holder",
    description: "Move your savings to the central bank or an active deposit-taking bank charter. Ports src/app/api/character/savings-holder/route.ts moveCharacterSavings.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["finance/savings"],
    status: "available",
  },
  wireTransfer: {
    id: "wireTransfer",
    name: "Wire Transfer",
    description: "Wire personal cash to another politician in your country (subject to a daily anchor-denominated cap). Ports src/app/api/characters/[id]/wire/route.ts core transfer + quota. Cross-border wires are PORT-STUB (no per-character currency wallets — see finance/wireTransfer.ts).",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["finance/wire"],
    status: "available",
  },
};

export function getActionCost(entry: ActionCatalogEntry, donorBaseLevel: number, politicalInfluence: number, favorability: number): number {
  if (entry.quotedActionCost) return entry.quotedActionCost(donorBaseLevel, politicalInfluence, favorability);
  return entry.baseCost;
}

// For tests: actions.fundraiseQuote
export function fundraiseQuote(donorBaseLevel: number, politicalInfluence: number): number {
  return fundraiseYield(donorBaseLevel, politicalInfluence);
}
