/**
 * Intra-party election constants.
 * All values cite mainline sources at <mainline-checkout>. Do not invent numbers.
 */

 // State party elections: src/lib/statePartyElections.ts ELECTION_DURATION_TURNS = 72
export const STATE_PARTY_ELECTION_DURATION_TURNS = 72;
// src/lib/statePartyElections.ts FOUNDING_STATE_ELECTION_DURATION_TURNS = 12
export const FOUNDING_STATE_ELECTION_DURATION_TURNS = 12;

// National party elections: src/lib/nationalPartyElections.ts NATIONAL_ELECTION_DURATION_TURNS = 72
export const NATIONAL_PARTY_ELECTION_DURATION_TURNS = 72;
// src/lib/nationalPartyElections.ts NATIONAL_ELECTION_MIN_DURATION_TURNS = 168
export const NATIONAL_PARTY_ELECTION_MIN_DURATION_TURNS = 168;
// src/lib/nationalPartyElections.ts NATIONAL_ELECTION_MAX_DURATION_TURNS = 420
export const NATIONAL_PARTY_ELECTION_MAX_DURATION_TURNS = 420;
// src/lib/nationalPartyElections.ts FOUNDING_CHAIR_ELECTION_DURATION_TURNS = 12
export const FOUNDING_CHAIR_ELECTION_DURATION_TURNS = 12;

// National committee elections: src/lib/nationalCommitteeElections.ts COMMITTEE_ELECTION_DURATION_TURNS = 168
export const COMMITTEE_ELECTION_DURATION_TURNS = 168;
// src/lib/nationalCommitteeElections.ts COMMITTEE_SIZE = 6
export const COMMITTEE_SIZE = 6;
// src/lib/nationalCommitteeElections.ts MAX_VOTES_PER_VOTER = 6
export const MAX_VOTES_PER_VOTER = 6;

// Coalition disband: src/lib/turn/coalitionDisbandCheck.ts majorityThreshold = floor(total/2)+1; expiresOnTurn used for turn countdown.
// Default disband vote window in turns (mirrors mainline Date-based 7 days -> 168 turns at 1 turn/hour).
export const COALITION_DISBAND_VOTE_DURATION_TURNS = 168;

// State leadership positions: src/lib/db/types/statePartyElection.ts StatePartyElectionPosition = "chair" | "viceChair" | "treasurer"
export const STATE_PARTY_POSITIONS = ["chair", "viceChair", "treasurer"] as const;
export const NATIONAL_PARTY_POSITIONS = ["chair", "viceChair", "treasurer"] as const;
