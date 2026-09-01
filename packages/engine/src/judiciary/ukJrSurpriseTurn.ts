/**
 * UK Judicial Review surprise turn — W29 port of src/lib/turn/ukJrSurpriseTurn.ts.
 *
 * Mainline: proxy court lean comes from ruling party's economic/social positions (cabinet ideology stand-in).
 * Source: src/lib/turn/ukJrSurpriseTurn.ts: resolveUkProxyCourtLean + processUkJrSurpriseTurn
 *         src/lib/uk/judicialReview/surpriseTemplates.ts
 *         src/lib/uk/judicialReview/surpriseSpawn.ts
 *
 * Determinism: RNG through WorldRng; no Math.random.
 */

import type { WorldState } from "../types.js";
import { rngFromState, type RngState } from "../rng.js";
import type { JrCaseAxis, JrSurpriseTemplate } from "./types.js";

export const UK_JR_SURPRISE_TEMPLATES: JrSurpriseTemplate[] = [
  {
    templateKey: "r-save-the-marshes-v-secretary-of-state-for-environment",
    title: "R (Save the Marshes) v Secretary of State for Environment",
    axis: "economic",
    positiveEffect: { legislationTypeId: "uk_climate_net_zero", policyOptionId: "uk_climate_net_zero_opt_5", effectDirection: -1 },
    negativeEffect: { legislationTypeId: "uk_climate_net_zero", policyOptionId: "uk_climate_net_zero_opt_1", effectDirection: 1 },
  },
  {
    templateKey: "r-north-sea-wind-leaseholders-v-crown-estate",
    title: "R (North Sea Wind Leaseholders) v Crown Estate Commissioners",
    axis: "economic",
    positiveEffect: { legislationTypeId: "uk_transport_rail", policyOptionId: "uk_transport_rail_opt_5", effectDirection: -1 },
    negativeEffect: { legislationTypeId: "uk_transport_rail", policyOptionId: "uk_transport_rail_opt_1", effectDirection: 1 },
  },
  {
    templateKey: "r-patient-voices-alliance-v-secretary-of-state-for-health",
    title: "R (Patient Voices Alliance) v Secretary of State for Health",
    axis: "economic",
    positiveEffect: { legislationTypeId: "uk_nhs_funding", policyOptionId: "uk_nhs_funding_opt_5", effectDirection: -1 },
    negativeEffect: { legislationTypeId: "uk_nhs_funding", policyOptionId: "uk_nhs_funding_opt_1", effectDirection: 1 },
  },
  {
    templateKey: "r-channel-watch-v-home-secretary",
    title: "R (Channel Watch) v Secretary of State for the Home Department",
    axis: "social",
    positiveEffect: { legislationTypeId: "uk_immigration_asylum", policyOptionId: "uk_immigration_asylum_opt_5", effectDirection: -1 },
    negativeEffect: { legislationTypeId: "uk_immigration_asylum", policyOptionId: "uk_immigration_asylum_opt_1", effectDirection: 1 },
  },
  {
    templateKey: "r-licence-fee-payers-v-bbc",
    title: "R (Licence Fee Payers Association) v British Broadcasting Corporation",
    axis: "social",
    positiveEffect: { legislationTypeId: "uk_bbc_public_media", policyOptionId: "uk_bbc_public_media_opt_5", effectDirection: -1 },
    negativeEffect: { legislationTypeId: "uk_bbc_public_media", policyOptionId: "uk_bbc_public_media_opt_1", effectDirection: 1 },
  },
  {
    templateKey: "r-trident-watch-v-secretary-of-state-for-defence",
    title: "R (Trident Watch) v Secretary of State for Defence",
    axis: "economic",
    positiveEffect: { legislationTypeId: "uk_trident_defence", policyOptionId: "uk_trident_defence_opt_5", effectDirection: 1 },
    negativeEffect: { legislationTypeId: "uk_trident_defence", policyOptionId: "uk_trident_defence_opt_1", effectDirection: -1 },
  },
  {
    templateKey: "r-fair-votes-uk-v-speaker-of-the-commons",
    title: "R (Fair Votes UK) v Speaker of the House of Commons",
    axis: "social",
    positiveEffect: { legislationTypeId: "uk_electoral_reform", policyOptionId: "uk_electoral_reform_opt_5", effectDirection: -1 },
    negativeEffect: { legislationTypeId: "uk_electoral_reform", policyOptionId: "uk_electoral_reform_opt_1", effectDirection: 1 },
  },
  {
    templateKey: "in-re-commuter-rail-timetable-v-dft",
    title: "In re Commuter Rail Timetable Challenge v Department for Transport",
    axis: "economic",
    positiveEffect: { legislationTypeId: "uk_transport_rail", policyOptionId: "uk_transport_rail_opt_5", effectDirection: -1 },
    negativeEffect: { legislationTypeId: "uk_transport_rail", policyOptionId: "uk_transport_rail_opt_1", effectDirection: 1 },
  },
];

export const UK_JR_SURPRISE_SPAWN_PROBABILITY_PER_TURN = 0.0035; // src/lib/uk/judicialReview/surpriseSpawn.ts

export function rollUkJrSurpriseSpawn(draw: number, prob = UK_JR_SURPRISE_SPAWN_PROBABILITY_PER_TURN): boolean {
  return draw < prob;
}

export function resolveUkProxyCourtLean(world: WorldState, axis: JrCaseAxis): -1 | 0 | 1 {
  const gov = world.governments["UK"];
  const partyId = gov?.governingPartyId ?? null;
  let economic = 0, social = 0;
  if (partyId) {
    const party = world.parties[partyId];
    if (party) {
      economic = party.economicPosition ?? 0;
      social = party.socialPosition ?? 0;
    }
  }
  const lean = axis === "economic" ? economic : social;
  if (lean > 0.5) return 1;
  if (lean < -0.5) return -1;
  return 0;
}

export interface UkJrSurpriseTurnResult {
  spawned: boolean;
  caseKey?: string;
  majoritySide?: -1 | 0 | 1;
}

export function processUkJrSurpriseTurn(world: WorldState): UkJrSurpriseTurnResult {
  const rng = rngFromState(world.meta.rng as RngState);
  const spawnDraw = rng.next();
  if (!rollUkJrSurpriseSpawn(spawnDraw)) {
    world.meta.rng = rng.state();
    return { spawned: false };
  }

  if (!world.ukJudicialReviewCases) world.ukJudicialReviewCases = [];
  const usedKeys = new Set(world.ukJudicialReviewCases.map((c) => c.templateKey));
  const available = UK_JR_SURPRISE_TEMPLATES.filter((t) => !usedKeys.has(t.templateKey));
  if (available.length === 0) {
    world.meta.rng = rng.state();
    return { spawned: false };
  }

  const pickDraw = rng.next();
  const idx = Math.min(available.length - 1, Math.floor(pickDraw * available.length));
  const template = available[idx]!;
  const majoritySide = resolveUkProxyCourtLean(world, template.axis);

  const chosenEffect =
    majoritySide === 1 ? template.positiveEffect : majoritySide === -1 ? template.negativeEffect : undefined;

  if (chosenEffect) {
    const lawId = `uk_jr_${template.templateKey}_${world.meta.turn}`;
    world.enactedLaws.push({
      id: lawId,
      title: `${template.title} (Judicial Review)`,
      countryId: "UK",
      enactedTurn: world.meta.turn,
      enactedDate: world.meta.date,
      source: "uk_judicial_review_surprise",
      effectDirection: chosenEffect.effectDirection,
      provision: {
        type: "policy",
        legislationTypeId: chosenEffect.legislationTypeId,
        policyOptionId: chosenEffect.policyOptionId,
        effectDirection: chosenEffect.effectDirection,
      },
    } as unknown as WorldState["enactedLaws"][number]);
  }

  const record = {
    id: `ukjr_${template.templateKey}_${world.meta.turn}`,
    countryId: "UK" as const,
    templateKey: template.templateKey,
    title: template.title,
    axis: template.axis,
    majoritySide,
    decidedAtTurn: world.meta.turn,
    createdAtTurn: world.meta.turn,
  };
  world.ukJudicialReviewCases.push(record);

  const leanLabel = majoritySide === 1 ? "right-leaning" : majoritySide === -1 ? "left-leaning" : "split";
  world.news.push({
    turn: world.meta.turn,
    date: world.meta.date,
    headline: `Judicial Review: ${template.title} — ${leanLabel} ruling`,
  });

  world.meta.rng = rng.state();
  return { spawned: true, caseKey: template.templateKey, majoritySide };
}
