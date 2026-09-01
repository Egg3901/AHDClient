/**
 * Party organization constants.
 * Sources mirror mainline standalone logic:
 * - ORG_DECAY_RATE / MIN_PRESENCE_ORG from src/lib/constants/partyOrg.ts
 * - Party influence defaults from src/lib/turn/partyInfluenceTurn.ts inline defaults
 * - PS caps/constants from src/lib/politicalStrength/strengthConstants.ts
 * - Tier thresholds from src/lib/parties/partyTier.ts
 */

export const ORG_DECAY_RATE = 0.03125; // Source: src/lib/constants/partyOrg.ts
export const MIN_PRESENCE_ORG = 5; // Source: src/lib/constants/partyOrg.ts

export const PARTY_INFLUENCE_DECAY_RATE = 0.04; // Source: src/lib/turn/partyInfluenceTurn.ts fallback
export const PARTY_INFLUENCE_BASE_RATE = 3; // Source: same
export const PARTY_INFLUENCE_MAX_PENALTY = 4; // Source: same
export const PARTY_INFLUENCE_POOL_MULTIPLIER = 3; // Source: same
export const PARTY_INFLUENCE_MAX_BONUS = 6; // Source: same
export const INFAMY_REFERENCE = 300; // Source: same

export const NATIONAL_PASSIVE_PS_PER_TURN = 20; // Source: src/lib/politicalStrength/strengthConstants.ts
export const STATE_PASSIVE_PS_PER_TURN = 5; // Source: same
export const NATIONAL_PS_CAP = 280; // Source: same
export const STATE_PS_CAP_DEFAULT = 30; // Source: same (unused in solo national-only PS)
export const MINOR_PARTY_BASE_PS_CAP = 100;
export const MINOR_PARTY_PS_CAP_PER_REGION = 10;
export const TIER_EARN_REGION_ORG_PCT = 20;
export const TIER_LOSE_REGION_ORG_PCT = 10;
export const TIER_GRADUATION_REGION_FRACTION = 1 / 3;
export const TIER_DEMOTION_REGION_FRACTION = 2 / 3;
export const MAJOR_DEMOTION_GRACE_TURNS = 240;
export const PS_INVESTMENT_MAX_TIERS = 20;
