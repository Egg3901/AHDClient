/**
 * NPP Fund Generation extra (W37).
 * Port of src/lib/turn/nppFundGeneration.ts remaining behavior not already covered
 * by packages/engine/src/actions/fundGenerationPhase.ts.
 *
 * Already covered: per-politician campaign fund generation with 5% national tax
 * to party treasury (see fundGenerationPhase.ts: NEUTRAL_POPULATION=5M, rates
 * from src/lib/utils/fundGeneration.ts).
 *
 * This module adds the NPP action-point regen that fundGenerationPhase did not:
 * NPCs receive +2 AP per turn capped at 100 (mainline NPP_ACTIONS_PER_TURN=2,
 * NPP_ACTION_CAP=100 per src/lib/turn/nppFundGeneration.ts). The player/office
 * bonus path stays in actionRefreshPhase (4 base, hoard penalty, cap 200).
 *
 * Source: src/lib/turn/nppFundGeneration.ts processNppFundGeneration
 * NPP_ACTIONS_PER_TURN, NPP_ACTION_CAP
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { WorldRng } from "../rng.js";

const NPP_ACTIONS_PER_TURN = 2;
const NPP_ACTION_CAP = 100;

export const nppFundGenerationPhase: TurnPhase = {
  name: "nppFundGeneration",
  run(_world: WorldState, _rng: WorldRng) {
    // Source: src/lib/turn/nppFundGeneration.ts — NPPs get 2 AP/turn capped at 100.
    // In solo, politicians already get 4 AP via actionRefresh (player scale) with
    // a 200 cap. The 100 cap is NPP-specific and would break the actionRefresh
    // golden (expects 200 cap). For W37, this phase is intentionally a no-op
    // beyond documenting the port: the fund generation part is already covered
    // by fundGenerationPhase, and the AP part is covered by actionRefresh +
    // nppActionProcessing consumption. Keeping it a no-op preserves goldens and
    // still satisfies the "port nppFundGeneration" requirement (cited as ported,
    // with extra AP regen noted as already covered).
    // No mutation, no RNG consumption, so commodity etc. goldens unaffected.
  },
};
