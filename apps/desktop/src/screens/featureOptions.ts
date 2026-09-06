/**
 * Generated from AHDGame's DEFAULT_GAME_STATE_FLAGS. Keep this snapshot in
 * sync with that allowlist when the game adds or retires a player setting.
 * Non-boolean seed values and derived autonomy fields are intentionally absent.
 */
export const FEATURE_OPTIONS = [
  { key: "forexEnabled", label: "Foreign exchange", description: "Enable currency markets and exchange rates.", category: "Economy", defaultValue: true },
  { key: "playerRandomEventsEnabled", label: "Random events", description: "Allow unexpected events to affect countries and players.", category: "World systems", defaultValue: true },
  { key: "crisisInteractionEnabled", label: "Crisis interaction", description: "Allow players and governments to respond to active crises.", category: "World systems", defaultValue: true },
  { key: "autoDisastersEnabled", label: "Natural disasters", description: "Let the world generate natural disasters over time.", category: "World systems", defaultValue: true },
  { key: "crisisAidBillsEnabled", label: "Crisis aid bills", description: "Allow legislation that funds responses to crises.", category: "Politics", defaultValue: true },
  { key: "rpgStatsEnabled", label: "Character stats", description: "Use character attributes in supported actions.", category: "Player systems", defaultValue: true },
  { key: "autoSectorSeedEnabled", label: "Automatic sector seeding", description: "Periodically reseed sectors with new companies.", category: "Advanced world settings", defaultValue: false },
  { key: "sectorTechTreesEnabled", label: "Sector technology trees", description: "Enable technology progression within economic sectors.", category: "Economy", defaultValue: true },
  { key: "onboardingChecklistEnabled", label: "Onboarding checklist", description: "Show the in-game checklist for new players.", category: "Player systems", defaultValue: true },
  { key: "worldEventsEnabled", label: "World events", description: "Enable persistent events that shape the wider world.", category: "World systems", defaultValue: true },
  { key: "legislationDemographicEffectsV2Enabled", label: "Legislation demographic effects", description: "Apply legislation effects to demographic behavior.", category: "Politics", defaultValue: true },
  { key: "granularPollEnabled", label: "Granular polling", description: "Show detailed polling across electorate groups.", category: "Politics", defaultValue: true },
  { key: "demographicsLayer1PositionsEnabled", label: "Detailed voter positions", description: "Use detailed voter positions to shape society and the economy.", category: "Politics", defaultValue: true },
  { key: "eraSystemEnabled", label: "Era rules", description: "Apply era-specific costs, growth, and world rules.", category: "World systems", defaultValue: true },
  { key: "conflictsEnabled", label: "Conflicts", description: "Enable international conflicts and their consequences.", category: "World systems", defaultValue: true },
  { key: "coldWarEnabled", label: "Cold War systems", description: "Enable bloc competition and Cold War mechanics.", category: "World systems", defaultValue: true },
  { key: "redistrictingEnabled", label: "Redistricting", description: "Allow governments to redraw electoral districts.", category: "Politics", defaultValue: true },
  { key: "subsidiaryCorporationsEnabled", label: "Corporate subsidiaries", description: "Allow corporations to create and operate subsidiaries.", category: "Economy", defaultValue: true },
  { key: "embargoTradeExposureEnabled", label: "Embargo trade exposure", description: "Make embargoes affect trade and economic exposure.", category: "Economy", defaultValue: true },
  { key: "liveElectionResultsEnabled", label: "Live election results", description: "Reveal election results as counting progresses.", category: "Politics", defaultValue: true },
  { key: "extractionAutoStrategyEnabled", label: "Resource extraction strategy", description: "Let extraction companies pursue an automatic strategy.", category: "Economy", defaultValue: true },
  { key: "seasonRecapEnabled", label: "Season recaps", description: "Show a recap of major events at the end of each season.", category: "Player systems", defaultValue: true },
  { key: "corpDealsEnabled", label: "Corporate deals", description: "Enable acquisitions and other corporation-to-corporation deals.", category: "Economy", defaultValue: true },
  { key: "intOrgAlignmentEnabled", label: "International organization alignment", description: "Enable alignment and influence in international organizations.", category: "Politics", defaultValue: true },
  // Deliberately NOT labelled "(V5)". That digit is the fifth iteration of the
// game's CORPORATE brain and has nothing to do with the autonomy ladder's v5
// tier, which is now a selectable option two fields up on the same screen.
{ key: "nppCorpStrategyEnabled", label: "NPP corporate strategy", description: "Allow autonomous countries to run corporate strategy for the companies they own.", category: "Advanced world settings", defaultValue: true },
  { key: "livingConflictsEnabled", label: "Living conflicts", description: "Keep conflicts active through persistent campaigns and responses.", category: "World systems", defaultValue: true },
  { key: "nppOffensiveInitiationEnabled", label: "NPP offensive initiation", description: "Allow autonomous countries to initiate military offensives.", category: "Advanced world settings", defaultValue: false },
  { key: "nppOffensiveJoinEnabled", label: "NPP offensive support", description: "Allow autonomous countries to join another country's offensive.", category: "Advanced world settings", defaultValue: false },
] as const;

export type FeatureFlagKey = (typeof FEATURE_OPTIONS)[number]["key"];
export type FeatureOption = (typeof FEATURE_OPTIONS)[number];

export const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = FEATURE_OPTIONS.map((option) => option.key);
