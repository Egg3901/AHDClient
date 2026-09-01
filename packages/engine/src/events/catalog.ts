/**
 * Event content catalog — ported from mainline src/lib/events/worldEvents/definitions.ts
 * WORLD_EVENT_SEED_DEFINITIONS (20 kinds) and src/lib/events/pree/seedDefinitions.ts
 * (player random events subset — 12 everyday events). No invented events; all
 * headlines, bodies, triggers, weights, and effects are cited from mainline.
 *
 * Each entry lists era gating (minYear/maxYear), country gating (requiresCountryIds),
 * schedule kind, and outcome effects mapped to solo systems. Effects that target
 * unported systems are listed as PORT-STUB with blocker.
 */

export type EventSchedule =
  | { kind: "window"; minGapTurns: number; maxGapTurns: number }
  | { kind: "recurring"; everyTurns: number; offsetTurns: number };

export type EventEffect =
  | { type: "treasuryDelta"; delta: number }
  | { type: "approvalDelta"; delta: number }
  | { type: "favorability"; delta: number }
  | { type: "infamy"; delta: number }
  | { type: "partyOrg"; delta: number }
  | { type: "gdpDelta"; delta: number }
  | { type: "inflationDelta"; delta: number }
  | { type: "unemploymentDelta"; delta: number }
  | { type: "sectorDemandModifier"; sectorType: string; pct: number; durationTurns: number }
  | { type: "sectorOutputDemandModifier"; sectorType: string; pct: number; durationTurns: number }
  | { type: "warEmergencyMitigation"; pct: number; durationTurns: number }
  | { type: "civilLibertiesDelta"; delta: number }
  | { type: "supportDelta"; delta: number }
  | { type: "politicalInfluence"; delta: number }
  | { type: "personalWealth"; delta: number }
  | { type: "wireOnly" }
  | { type: "PORT-STUB"; blocker: string; originalType: string };

export interface EventDefinition {
  kind: string;
  title: string;
  headline: string;
  body: string;
  baseWeight: number;
  eligibility: string[];
  requiresCountryIds?: string[];
  minYear?: number;
  maxYear?: number;
  minTension?: number;
  schedule?: EventSchedule;
  effects: EventEffect[];
  defaultOptionId: string;
  options: Array<{
    id: string;
    label: string;
    isDefault?: boolean;
    effects: EventEffect[];
  }>;
}

// ── Helpers for effect attribution ───────────────────────────────────
// Most events below have one default option (wireOnly or safe). The
// per-option effects here mirror the first-tier outcome in mainline handlers
// (e.g. coldWarWorldEvents.ts) where multi-option events have roll-branched
// outcomes. For solo, we collapse to the default option's effects as the
// deterministic resolution (player choice is deferred to W34 action catalog).

/**
 * 20 world events (country-scope) — WORLD_EVENT_SEED_DEFINITIONS.
 * Source: src/lib/events/worldEvents/definitions.ts (all 20 kinds).
 *
 * Schedule and era gating ported verbatim; headlines/bodies are mainline copy
 * (not invented). Effects are reduced to the default option's tier as noted.
 */
export const WORLD_EVENTS: EventDefinition[] = [
  {
    kind: "worldEvents.sportsVictory",
    title: "National Sports Victory",
    headline: "The national team has won a major international title.",
    body: "Celebrations are breaking out nationwide. No decision is required — this is a wire-only morale event.",
    baseWeight: 10,
    eligibility: ["all"],
    schedule: { kind: "window", minGapTurns: 6, maxGapTurns: 16 },
    defaultOptionId: "acknowledge",
    effects: [{ type: "wireOnly" }],
    options: [{ id: "acknowledge", label: "National celebration", isDefault: true, effects: [{ type: "wireOnly" }] }],
  },
  {
    kind: "worldEvents.papalVisit",
    title: "Papal Visit",
    headline: "A papal visit has been announced.",
    body: "The visit is being arranged as a state occasion. No decision is required — this is a wire-only morale event.",
    baseWeight: 6,
    eligibility: ["all"],
    schedule: { kind: "window", minGapTurns: 20, maxGapTurns: 40 },
    defaultOptionId: "acknowledge",
    effects: [{ type: "wireOnly" }],
    options: [{ id: "acknowledge", label: "State reception", isDefault: true, effects: [{ type: "wireOnly" }] }],
  },
  {
    kind: "worldEvents.royalEvent",
    title: "Royal Event",
    headline: "A royal occasion is drawing national attention.",
    body: "The nation is marking a jubilee, wedding, or funeral. No decision is required — this is a wire-only morale event with a small tourism-sector demand bump.",
    baseWeight: 6,
    eligibility: ["all"],
    requiresCountryIds: ["UK"],
    schedule: { kind: "window", minGapTurns: 24, maxGapTurns: 48 },
    defaultOptionId: "acknowledge",
    effects: [{ type: "sectorDemandModifier", sectorType: "retail", pct: 2, durationTurns: 4 }],
    options: [{ id: "acknowledge", label: "National celebration", isDefault: true, effects: [{ type: "sectorDemandModifier", sectorType: "retail", pct: 2, durationTurns: 4 }] }],
  },
  {
    kind: "worldEvents.ukBudgetDay",
    title: "Budget Day",
    headline: "The Chancellor is about to deliver the Budget.",
    body: "Red boxes, OBR forecasts, and a packed chamber. How the government plays Budget Day shapes the week's narrative.",
    baseWeight: 8,
    eligibility: ["all"],
    requiresCountryIds: ["UK"],
    schedule: { kind: "window", minGapTurns: 20, maxGapTurns: 36 },
    defaultOptionId: "steady",
    effects: [{ type: "treasuryDelta", delta: 0 }, { type: "wireOnly" }],
    options: [
      { id: "steady", label: "Deliver a steady Budget", isDefault: true, effects: [{ type: "wireOnly" }] },
      { id: "giveaway", label: "Splash the cash", effects: [{ type: "treasuryDelta", delta: -5000 }, { type: "inflationDelta", delta: 0.2 }] },
      { id: "austerity", label: "Tighten the purse strings", effects: [{ type: "treasuryDelta", delta: 5000 }, { type: "gdpDelta", delta: -0.5 }] },
      { id: "uturn", label: "U-turn after the OBR leak", effects: [{ type: "favorability", delta: -2 }] },
    ],
  },
  {
    kind: "worldEvents.ukNhsWinter",
    title: "NHS Winter Pressure",
    headline: "Winter has arrived and the NHS is under strain.",
    body: "Ambulance queues, corridor care, and cancelled electives dominate the bulletins.",
    baseWeight: 8,
    eligibility: ["all"],
    requiresCountryIds: ["UK"],
    schedule: { kind: "window", minGapTurns: 16, maxGapTurns: 32 },
    defaultOptionId: "acknowledge",
    effects: [{ type: "wireOnly" }],
    options: [
      { id: "acknowledge", label: "Acknowledge the winter crisis", isDefault: true, effects: [{ type: "wireOnly" }] },
      { id: "surge", label: "Announce an emergency surge package", effects: [{ type: "treasuryDelta", delta: -8000 }] },
      { id: "shrug", label: "Call it seasonal and move on", effects: [{ type: "favorability", delta: -1 }] },
    ],
  },
  {
    kind: "worldEvents.ukBbcCharter",
    title: "BBC Charter Skirmish",
    headline: "Another row over the BBC charter and licence fee.",
    body: "Culture-war clips meet funding arithmetic. The government must pick a line.",
    baseWeight: 6,
    eligibility: ["all"],
    requiresCountryIds: ["UK"],
    schedule: { kind: "window", minGapTurns: 24, maxGapTurns: 48 },
    defaultOptionId: "steady",
    effects: [{ type: "wireOnly" }],
    options: [
      { id: "steady", label: "Defend the charter settlement", isDefault: true, effects: [{ type: "wireOnly" }] },
      { id: "reform", label: "Open a reform review", effects: [{ type: "partyOrg", delta: 1 }] },
      { id: "clash", label: "Pick a public fight with the Director-General", effects: [{ type: "favorability", delta: -1 }] },
    ],
  },
  {
    kind: "worldEvents.stateVisit",
    title: "State Visit",
    headline: "A foreign head of state has requested a state visit.",
    body: "The executive must decide how to host the visiting delegation.",
    baseWeight: 8,
    eligibility: ["all"],
    schedule: { kind: "window", minGapTurns: 8, maxGapTurns: 20 },
    defaultOptionId: "standard",
    effects: [{ type: "wireOnly" }],
    options: [
      { id: "lavish", label: "Host lavishly", effects: [{ type: "treasuryDelta", delta: -3000 }, { type: "favorability", delta: 1 }] },
      { id: "standard", label: "Host standard reception", isDefault: true, effects: [{ type: "wireOnly" }] },
      { id: "decline", label: "Decline the visit", effects: [{ type: "favorability", delta: -1 }] },
    ],
  },
  {
    kind: "worldEvents.intlSummit",
    title: "International Summit",
    headline: "An international summit is convening.",
    body: "The executive must decide what stance to take at the summit.",
    baseWeight: 8,
    eligibility: ["all"],
    schedule: { kind: "window", minGapTurns: 10, maxGapTurns: 24 },
    defaultOptionId: "moderate",
    effects: [{ type: "wireOnly" }],
    options: [
      { id: "assertive", label: "Take an assertive stance", effects: [{ type: "favorability", delta: 1 }] },
      { id: "moderate", label: "Take a moderate stance", isDefault: true, effects: [{ type: "wireOnly" }] },
      { id: "conciliatory", label: "Take a conciliatory stance", effects: [{ type: "partyOrg", delta: -1 }] },
    ],
  },
  {
    kind: "worldEvents.scientificBreakthrough",
    title: "Scientific Breakthrough",
    headline: "Researchers have announced a major scientific breakthrough.",
    body: "The executive must decide whether to fund commercialization.",
    baseWeight: 6,
    eligibility: ["all"],
    schedule: { kind: "window", minGapTurns: 12, maxGapTurns: 30 },
    defaultOptionId: "decline",
    effects: [{ type: "wireOnly" }],
    options: [
      { id: "fund", label: "Fund commercialization", effects: [{ type: "treasuryDelta", delta: -10000 }, { type: "sectorDemandModifier", sectorType: "technology", pct: 3, durationTurns: 6 }] },
      { id: "decline", label: "Decline to fund", isDefault: true, effects: [{ type: "wireOnly" }] },
    ],
  },
  {
    kind: "worldEvents.olympics",
    title: "Olympics",
    headline: "The Olympic Games are coming to a host nation.",
    body: "The nation prepares to host the Olympic Games. No decision is required — this is a wire-only flavor event with a temporary construction/tourism demand bump.",
    baseWeight: 1,
    eligibility: ["all"],
    // No schedule here: driven by GLOBAL_HOST_EVENTS recurring cadence (see scheduler — every 48 offset 12, picks one host)
    schedule: { kind: "recurring", everyTurns: 48, offsetTurns: 12 },
    defaultOptionId: "acknowledge",
    effects: [{ type: "sectorDemandModifier", sectorType: "construction_services", pct: 4, durationTurns: 6 }],
    options: [{ id: "acknowledge", label: "Host the Games", isDefault: true, effects: [{ type: "sectorDemandModifier", sectorType: "construction_services", pct: 4, durationTurns: 6 }] }],
  },
  {
    kind: "worldEvents.worldsFair",
    title: "World's Fair",
    headline: "The World's Fair is coming to a host nation.",
    body: "The nation prepares to host the World's Fair. No decision is required — this is a wire-only flavor event with a small temporary demand bump.",
    baseWeight: 1,
    eligibility: ["all"],
    schedule: { kind: "recurring", everyTurns: 36, offsetTurns: 30 },
    defaultOptionId: "acknowledge",
    effects: [{ type: "sectorDemandModifier", sectorType: "retail", pct: 2, durationTurns: 4 }],
    options: [{ id: "acknowledge", label: "Host the Fair", isDefault: true, effects: [{ type: "sectorDemandModifier", sectorType: "retail", pct: 2, durationTurns: 4 }] }],
  },
  {
    kind: "worldEvents.sputnikMoment",
    title: "Sputnik Moment",
    headline: "A satellite triumph stuns the world.",
    body: "The successful satellite launch has captured global attention. The executive must decide how to frame the achievement.",
    baseWeight: 8,
    eligibility: ["all"],
    requiresCountryIds: ["RU"],
    minYear: 1955,
    maxYear: 1962,
    schedule: { kind: "window", minGapTurns: 96, maxGapTurns: 200 },
    defaultOptionId: "downplay",
    effects: [{ type: "wireOnly" }],
    options: [
      { id: "propaganda", label: "Maximum propaganda", effects: [{ type: "treasuryDelta", delta: -15000 }, { type: "favorability", delta: 2 }] },
      { id: "scientific", label: "Sober scientific framing", effects: [{ type: "sectorDemandModifier", sectorType: "technology", pct: 3, durationTurns: 6 }] },
      { id: "downplay", label: "Downplay militarily", isDefault: true, effects: [{ type: "wireOnly" }] },
    ],
  },
  {
    kind: "worldEvents.berlinCrisis",
    title: "Berlin Crisis",
    headline: "The refugee exodus through the open sector border is becoming unbearable.",
    body: "Thousands are crossing to the West through Berlin each month. The executive must decide how to stop the bleed.",
    baseWeight: 8,
    eligibility: ["all"],
    requiresCountryIds: ["DD"],
    minYear: 1958,
    maxYear: 1962,
    schedule: { kind: "window", minGapTurns: 150, maxGapTurns: 300 },
    defaultOptionId: "moscow",
    effects: [{ type: "favorability", delta: -1 }],
    options: [
      { id: "seal", label: "Seal the border", effects: [{ type: "favorability", delta: -5 }] },
      { id: "conciliate", label: "Conciliate and seek talks", effects: [{ type: "favorability", delta: 1 }] },
      { id: "moscow", label: "Request Moscow's guidance", isDefault: true, effects: [{ type: "favorability", delta: -1 }] },
    ],
  },
  {
    kind: "worldEvents.spaceRaceMilestone",
    title: "Space Race Milestone",
    headline: "A chance to beat the rival superpower to the next space milestone.",
    body: "The next great space milestone is within reach. The executive must decide how hard to push the program.",
    baseWeight: 8,
    eligibility: ["all"],
    requiresCountryIds: ["US", "RU"],
    minYear: 1957,
    maxYear: 1975,
    schedule: { kind: "window", minGapTurns: 150, maxGapTurns: 300 },
    defaultOptionId: "cede",
    effects: [{ type: "favorability", delta: -1 }],
    options: [
      { id: "crash", label: "Fund the crash program", effects: [{ type: "treasuryDelta", delta: -20000 }, { type: "favorability", delta: 2 }] },
      { id: "steady", label: "Steady funding", effects: [{ type: "treasuryDelta", delta: -5000 }] },
      { id: "cede", label: "Cede the milestone", isDefault: true, effects: [{ type: "favorability", delta: -1 }] },
    ],
  },
  {
    kind: "worldEvents.oilEmbargoShock",
    title: "Oil Embargo Shock",
    headline: "An oil embargo has sent prices spiking and queues forming.",
    body: "Fuel prices are soaring and lines at filling stations stretch for blocks. The executive must decide how to respond.",
    baseWeight: 8,
    eligibility: ["all"],
    minYear: 1973,
    maxYear: 1979,
    schedule: { kind: "window", minGapTurns: 150, maxGapTurns: 288 },
    defaultOptionId: "ride",
    effects: [{ type: "inflationDelta", delta: 0.5 }],
    options: [
      { id: "controls", label: "Impose price controls", effects: [{ type: "inflationDelta", delta: -0.3 }] },
      { id: "reserve", label: "Release the strategic reserve", effects: [{ type: "treasuryDelta", delta: -8000 }] },
      { id: "ride", label: "Ride it out", isDefault: true, effects: [{ type: "inflationDelta", delta: 0.5 }] },
    ],
  },
  {
    kind: "worldEvents.detenteOverture",
    title: "Detente Overture",
    headline: "A back-channel summit offer has arrived from the rival superpower.",
    body: "Through quiet intermediaries, the rival superpower has proposed a leadership summit. The executive must decide how to respond.",
    baseWeight: 8,
    eligibility: ["all"],
    requiresCountryIds: ["US", "RU"],
    minYear: 1969,
    maxYear: 1979,
    schedule: { kind: "window", minGapTurns: 200, maxGapTurns: 350 },
    defaultOptionId: "decline",
    effects: [{ type: "wireOnly" }],
    options: [
      { id: "summit", label: "Pursue the summit", effects: [{ type: "favorability", delta: 1 }] },
      { id: "concessions", label: "Demand concessions first", effects: [{ type: "favorability", delta: -1 }] },
      { id: "decline", label: "Decline quietly", isDefault: true, effects: [{ type: "wireOnly" }] },
    ],
  },
  {
    kind: "worldEvents.panicBuying",
    title: "Panic Buying",
    headline: "Shoppers are stripping shelves as war fears spread.",
    body: "With the crisis abroad dominating every broadcast, households are hoarding food, fuel, and staples. Queues form before dawn and shelves empty by noon. The executive must decide how to respond.",
    baseWeight: 10,
    eligibility: ["all"],
    minTension: 60,
    schedule: { kind: "window", minGapTurns: 10, maxGapTurns: 24 },
    defaultOptionId: "calm",
    effects: [{ type: "wireOnly" }],
    options: [
      { id: "ration", label: "Impose emergency rationing", effects: [{ type: "warEmergencyMitigation", pct: 20, durationTurns: 12 }] },
      { id: "calm", label: "Appeal for calm", isDefault: true, effects: [{ type: "wireOnly" }] },
      { id: "release", label: "Release strategic stockpiles", effects: [{ type: "treasuryDelta", delta: -4000 }] },
    ],
  },
  {
    kind: "worldEvents.bankRun",
    title: "Run on the Banks",
    headline: "Depositors are queueing to pull their savings out.",
    body: "Fear that war will freeze accounts or gut the currency has depositors lining up at branch doors. Withdrawals are accelerating and small banks are wiring for help. The executive must decide how to respond.",
    baseWeight: 8,
    eligibility: ["all"],
    minTension: 65,
    schedule: { kind: "window", minGapTurns: 16, maxGapTurns: 32 },
    defaultOptionId: "standBy",
    effects: [{ type: "wireOnly" }],
    options: [
      { id: "guarantee", label: "Guarantee all deposits", effects: [{ type: "treasuryDelta", delta: -12000 }] },
      { id: "holiday", label: "Declare a bank holiday", effects: [{ type: "warEmergencyMitigation", pct: 15, durationTurns: 10 }] },
      { id: "standBy", label: "Stand by the banks publicly", isDefault: true, effects: [{ type: "wireOnly" }] },
    ],
  },
  {
    kind: "worldEvents.civilDefenseFever",
    title: "Civil Defense Fever",
    headline: "Families are digging shelters and demanding sirens.",
    body: "Backyard shelters, evacuation maps, and duck-and-cover drills are the national obsession. Local officials are begging for guidance and funding. The executive must decide how far to lean in.",
    baseWeight: 8,
    eligibility: ["all"],
    minTension: 50,
    schedule: { kind: "window", minGapTurns: 12, maxGapTurns: 28 },
    defaultOptionId: "drills",
    effects: [{ type: "civilLibertiesDelta", delta: -1 }],
    options: [
      { id: "fund", label: "Fund a national shelter program", effects: [{ type: "treasuryDelta", delta: -6000 }] },
      { id: "drills", label: "Order drills and leaflets", isDefault: true, effects: [{ type: "civilLibertiesDelta", delta: -1 }] },
      { id: "dismiss", label: "Dismiss the panic", effects: [{ type: "favorability", delta: -1 }] },
    ],
  },
  {
    kind: "worldEvents.warScareProtests",
    title: "War Scare Protests",
    headline: "Crowds are in the streets demanding peace.",
    body: "Marches against the war fill the squares of every major city. Some carry candles, some carry effigies of the government. The executive must decide how to meet them.",
    baseWeight: 8,
    eligibility: ["all"],
    minTension: 60,
    schedule: { kind: "window", minGapTurns: 10, maxGapTurns: 22 },
    defaultOptionId: "acknowledge",
    effects: [{ type: "wireOnly" }],
    options: [
      { id: "address", label: "Address the nation", effects: [{ type: "favorability", delta: 1 }] },
      { id: "acknowledge", label: "Let them march", isDefault: true, effects: [{ type: "wireOnly" }] },
      { id: "crackdown", label: "Disperse the marches", effects: [{ type: "civilLibertiesDelta", delta: -3 }] },
    ],
  },
];

// ── Player random events (character-scope, PREE) ──────────────────────────
// Source: src/lib/events/pree/seedDefinitions.ts + handlers/everydayEvents.ts
// (12 everyday events, grounded flavor). These are player-facing random events
// that fire via playerRandomEvents phase (once per turn, weighted pick).
// For solo, the player is the only character, so we roll once per turn.
// Effects are collapsed to default option's three-tier mid outcome (deterministic
// roll branch via rng) — same tier table as handler applies.
// For test citational fidelity, each lists its mainline kind verbatim.

export const PLAYER_RANDOM_EVENTS: EventDefinition[] = [
  {
    kind: "pree.lostWallet",
    title: "Lost Wallet",
    headline: "A stuffed wallet is sitting on the sidewalk in front of you.",
    body: "Cards, a wad of cash, and a name you don't recognize. The street is quiet.",
    baseWeight: 30,
    eligibility: ["all"],
    defaultOptionId: "leaveIt",
    effects: [{ type: "favorability", delta: -1 }],
    options: [
      { id: "turnIn", label: "Track down the owner and return it", effects: [{ type: "favorability", delta: 2 }] },
      { id: "takeCash", label: "Keep the cash, ditch the wallet", effects: [{ type: "personalWealth", delta: 2000 }, { type: "infamy", delta: 1 }] },
      { id: "dropAtStation", label: "Drop it at the police station", effects: [{ type: "favorability", delta: 1 }] },
      { id: "leaveIt", label: "Leave it where it is", isDefault: true, effects: [{ type: "favorability", delta: -1 }] },
    ],
  },
  {
    kind: "pree.fenceDispute",
    title: "Fence Dispute",
    headline: "Your neighbor says your new fence is on their property line.",
    body: "They've sent a measured drawing and a pointed note. The fence went in last month.",
    baseWeight: 25,
    eligibility: ["all"],
    defaultOptionId: "ignore",
    effects: [{ type: "favorability", delta: -1 }],
    options: [
      { id: "surveyIt", label: "Hire a surveyor", effects: [{ type: "personalWealth", delta: -3000 }] },
      { id: "negotiate", label: "Talk it out over the fence", effects: [{ type: "favorability", delta: 1 }] },
      { id: "tearDown", label: "Just pull your fence down", effects: [{ type: "wireOnly" }] },
      { id: "ignore", label: "Ignore the complaint", isDefault: true, effects: [{ type: "favorability", delta: -1 }] },
    ],
  },
  {
    kind: "pree.volunteerFirefighter",
    title: "Volunteer Fire Department Drive",
    headline: "The local volunteer fire department left a recruitment flyer at your door.",
    body: "They're short staffed and asking for new members. A donation envelope is paper clipped to it.",
    baseWeight: 35,
    eligibility: ["all"],
    defaultOptionId: "ignore",
    effects: [{ type: "wireOnly" }],
    options: [
      { id: "join", label: "Sign up to volunteer", effects: [{ type: "favorability", delta: 2 }] },
      { id: "donate", label: "Donate to the department instead", effects: [{ type: "favorability", delta: 1 }, { type: "personalWealth", delta: -2000 }] },
      { id: "spreadWord", label: "Share their flyer", effects: [{ type: "favorability", delta: 1 }] },
      { id: "ignore", label: "Recycle the flyer", isDefault: true, effects: [{ type: "wireOnly" }] },
    ],
  },
  {
    kind: "pree.annualCheckup",
    title: "Annual Checkup Reminder",
    headline: "Your doctor's office sent the annual physical reminder.",
    body: "The card says it has been over a year. The online portal link is at the bottom.",
    baseWeight: 40,
    eligibility: ["all"],
    minYear: 2010,
    defaultOptionId: "skip",
    effects: [{ type: "favorability", delta: -1 }],
    options: [
      { id: "goIn", label: "Book the physical", effects: [{ type: "wireOnly" }] },
      { id: "telehealth", label: "Do a telehealth visit", effects: [{ type: "wireOnly" }] },
      { id: "reschedule", label: "Push it to next month", effects: [{ type: "wireOnly" }] },
      { id: "skip", label: "Skip it this year", isDefault: true, effects: [{ type: "favorability", delta: -1 }] },
    ],
  },
  {
    kind: "pree.almaMaterCall",
    title: "Alma Mater Fundraising Call",
    headline: "The university fundraising office is on the line.",
    body: "A development officer wants to talk about your class gift and a naming opportunity.",
    baseWeight: 30,
    eligibility: ["all"],
    defaultOptionId: "hangUp",
    effects: [{ type: "wireOnly" }],
    options: [
      { id: "majorGift", label: "Make a major gift", effects: [{ type: "personalWealth", delta: -10000 }, { type: "favorability", delta: 2 }] },
      { id: "modestGift", label: "Give a modest amount", effects: [{ type: "personalWealth", delta: -2000 }, { type: "favorability", delta: 1 }] },
      { id: "pledgeLater", label: "Say you'll think about it", effects: [{ type: "wireOnly" }] },
      { id: "hangUp", label: "Politely decline", isDefault: true, effects: [{ type: "wireOnly" }] },
    ],
  },
  {
    kind: "pree.juryDuty",
    title: "Jury Duty Summons",
    headline: "A jury duty summons arrived in the mail.",
    body: "You have been called for jury duty next week. The slip says to report at 8 a.m.",
    baseWeight: 20,
    eligibility: ["all"],
    defaultOptionId: "defer",
    effects: [{ type: "wireOnly" }],
    options: [
      { id: "serve", label: "Report for duty", effects: [{ type: "favorability", delta: 1 }] },
      { id: "defer", label: "Request a deferral", isDefault: true, effects: [{ type: "wireOnly" }] },
      { id: "ignoreSummons", label: "Ignore the summons", effects: [{ type: "infamy", delta: 1 }] },
    ],
  },
  {
    kind: "pree.charityGala",
    title: "Charity Gala Invite",
    headline: "An invitation to a charity gala has arrived.",
    body: "A good cause, a good room, and a silent auction. Your presence would be noticed.",
    baseWeight: 25,
    eligibility: ["all"],
    defaultOptionId: "decline",
    effects: [{ type: "wireOnly" }],
    options: [
      { id: "attend", label: "Attend the gala", effects: [{ type: "personalWealth", delta: -5000 }, { type: "favorability", delta: 2 }] },
      { id: "donateGala", label: "Donate without attending", effects: [{ type: "personalWealth", delta: -2000 }, { type: "favorability", delta: 1 }] },
      { id: "decline", label: "Decline", isDefault: true, effects: [{ type: "wireOnly" }] },
    ],
  },
  {
    kind: "pree.constituentLetters",
    title: "Constituent Letters",
    headline: "A stack of constituent letters has landed on your desk.",
    body: "Voters are writing about the issues that matter to them. How you respond matters.",
    baseWeight: 20,
    eligibility: ["politician"],
    defaultOptionId: "formLetter",
    effects: [{ type: "supportDelta", delta: 1 }],
    options: [
      { id: "personalReply", label: "Write personal replies", effects: [{ type: "supportDelta", delta: 2 }, { type: "favorability", delta: 1 }] },
      { id: "formLetter", label: "Send a form letter", isDefault: true, effects: [{ type: "supportDelta", delta: 1 }] },
      { id: "ignoreLetters", label: "File them away", effects: [{ type: "supportDelta", delta: -1 }] },
    ],
  },
  {
    kind: "pree.endorsementDilemma",
    title: "Endorsement Dilemma",
    headline: "A controversial figure wants your endorsement.",
    body: "Their supporters are passionate, but the association carries risk.",
    baseWeight: 15,
    eligibility: ["politician"],
    defaultOptionId: "declineEndorse",
    effects: [{ type: "wireOnly" }],
    options: [
      { id: "endorse", label: "Give the endorsement", effects: [{ type: "supportDelta", delta: 2 }, { type: "favorability", delta: -1 }] },
      { id: "declineEndorse", label: "Decline quietly", isDefault: true, effects: [{ type: "wireOnly" }] },
      { id: "counterEndorse", label: "Endorse their opponent instead", effects: [{ type: "favorability", delta: 1 }, { type: "supportDelta", delta: -1 }] },
    ],
  },
  {
    kind: "pree.debateGaffe",
    title: "Debate Gaffe",
    headline: "You made a noticeable slip during a public appearance.",
    body: "The clip is circulating. How you handle the follow up will shape the narrative.",
    baseWeight: 15,
    eligibility: ["inElection"],
    defaultOptionId: "ownIt",
    effects: [{ type: "favorability", delta: -1 }],
    options: [
      { id: "ownIt", label: "Own the mistake", isDefault: true, effects: [{ type: "favorability", delta: -1 }] },
      { id: "deflect", label: "Deflect and pivot", effects: [{ type: "favorability", delta: -2 }] },
      { id: "apologize", label: "Issue a full apology", effects: [{ type: "favorability", delta: 1 }, { type: "infamy", delta: -1 }] },
    ],
  },
  {
    kind: "pree.campaignViral",
    title: "Campaign Goes Viral",
    headline: "A moment from your campaign is going viral online.",
    body: "Views are climbing fast. The attention is a double edged sword.",
    baseWeight: 10,
    eligibility: ["inElection"],
    defaultOptionId: "ride",
    effects: [{ type: "supportDelta", delta: 2 }],
    options: [
      { id: "ride", label: "Ride the wave", isDefault: true, effects: [{ type: "supportDelta", delta: 2 }] },
      { id: "amplify", label: "Amplify with ad spend", effects: [{ type: "supportDelta", delta: 3 }, { type: "personalWealth", delta: -3000 }] },
      { id: "downplay", label: "Downplay the attention", effects: [{ type: "supportDelta", delta: 1 }] },
    ],
  },
  {
    kind: "pree.productRecall",
    title: "Product Recall",
    headline: "A product linked to your corporate portfolio has been recalled.",
    body: "The defect is not catastrophic, but the headlines are unflattering and the fix will cost money.",
    baseWeight: 15,
    eligibility: ["ceo"],
    defaultOptionId: "recall",
    effects: [{ type: "treasuryDelta", delta: -5000 }],
    options: [
      { id: "recall", label: "Issue the recall", isDefault: true, effects: [{ type: "treasuryDelta", delta: -5000 }] },
      { id: "quietFix", label: "Quietly fix the defect", effects: [{ type: "infamy", delta: 2 }] },
      { id: "deny", label: "Deny the defect", effects: [{ type: "infamy", delta: 3 }] },
    ],
  },
];

export const ALL_WORLD_EVENT_KINDS = WORLD_EVENTS.map((e) => e.kind);
export const ALL_PLAYER_EVENT_KINDS = PLAYER_RANDOM_EVENTS.map((e) => e.kind);
