/**
 * Registration drift and decay (passive Reg movement).
 * Ports src/lib/turn/partyOrg/regDriftDecay.ts pure helpers
 * computeDriftDeltas / computeDecayDeltas and pooling logic.
 * All constants cite pacingConstants.ts sources.
 */

import {
  NON_PARTY_BUCKET_INDEPENDENT_BIAS,
  PASSIVE_REG_DECAY_RATE,
  PASSIVE_REG_DRIFT_RATE,
  REG_DRIFT_CATCH_ELIGIBILITY_ORG_PCT,
  REG_LAG_BELOW_ORG_PCT,
} from "./constants.js";

export interface PartyView {
  rowId: string;
  partyId: string;
  orgPct: number;
  regPct: number;
}

export interface PartyDelta {
  partyId: string;
  rowId: string;
  delta: number;
  newReg: number;
}

export interface PoolDelta {
  independent: number;
  unregistered: number;
}

/**
 * Drift: each party's reg moves UP toward max(0, org - lag) by rate.
 * One-directional (up only). Source: regDriftDecay.ts computeDriftDeltas
 */
export function computeDriftDeltas(
  parties: PartyView[],
  rate: number = PASSIVE_REG_DRIFT_RATE,
  regLagBelowOrg: number = REG_LAG_BELOW_ORG_PCT,
): { partyDeltas: PartyDelta[]; poolResidual: number } {
  let netParty = 0;
  const partyDeltas: PartyDelta[] = [];
  for (const p of parties) {
    const target = Math.max(0, p.orgPct - regLagBelowOrg);
    const gap = target - p.regPct;
    if (gap <= 0) continue;
    const magnitude = Math.min(rate, Math.abs(gap));
    const delta = magnitude;
    netParty += delta;
    partyDeltas.push({ partyId: p.partyId, rowId: p.rowId, delta, newReg: p.regPct + delta });
  }
  return { partyDeltas, poolResidual: -netParty };
}

/**
 * Decay: each party with reg>0 loses rate, routed via sqrt(org) to eligible parties
 * or to non-party buckets if none eligible.
 * Source: regDriftDecay.ts computeDecayDeltas
 */
export function computeDecayDeltas(
  parties: PartyView[],
  rate: number = PASSIVE_REG_DECAY_RATE,
  eligibilityOrgPct: number = REG_DRIFT_CATCH_ELIGIBILITY_ORG_PCT,
  independentBias: number = NON_PARTY_BUCKET_INDEPENDENT_BIAS,
  decayRelief?: { partyId: string; factor: number },
): { partyDeltas: PartyDelta[]; poolDelta: PoolDelta } {
  const losses = parties.map((p) => {
    const baseLoss = Math.min(rate, Math.max(0, p.regPct));
    const loss = decayRelief && p.partyId === decayRelief.partyId ? baseLoss * (1 - decayRelief.factor) : baseLoss;
    return { partyId: p.partyId, rowId: p.rowId, loss, orgPct: p.orgPct, regPct: p.regPct };
  });
  const totalLost = losses.reduce((sum, l) => sum + l.loss, 0);

  const eligible = parties.filter((p) => p.orgPct >= eligibilityOrgPct);
  const totalWeight = eligible.reduce((sum, p) => sum + Math.sqrt(p.orgPct), 0);

  const byPartyId = new Map<string, { rowId: string; delta: number; regPct: number }>();
  for (const l of losses) {
    byPartyId.set(l.partyId, { rowId: l.rowId, delta: -l.loss, regPct: l.regPct });
  }
  for (const p of eligible) {
    if (totalWeight === 0) break;
    const share = (Math.sqrt(p.orgPct) / totalWeight) * totalLost;
    const cur = byPartyId.get(p.partyId);
    if (cur) cur.delta += share;
    else byPartyId.set(p.partyId, { rowId: p.rowId, delta: share, regPct: p.regPct });
  }

  const partyDeltas: PartyDelta[] = [];
  for (const [partyId, info] of byPartyId) {
    if (info.delta === 0) continue;
    partyDeltas.push({ partyId, rowId: info.rowId, delta: info.delta, newReg: info.regPct + info.delta });
  }

  const poolDelta: PoolDelta = { independent: 0, unregistered: 0 };
  if (eligible.length === 0 && totalLost > 0) {
    const indWeight = independentBias;
    const unregWeight = 1;
    const denom = indWeight + unregWeight;
    poolDelta.independent = (totalLost * indWeight) / denom;
    poolDelta.unregistered = (totalLost * unregWeight) / denom;
  }
  return { partyDeltas, poolDelta };
}
