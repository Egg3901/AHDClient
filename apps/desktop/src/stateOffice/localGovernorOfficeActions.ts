import {
  ADDRESS_ACTION_COST,
  ADDRESS_BODY_MAX_LENGTH,
  ADDRESS_COOLDOWN_TURNS,
  ADDRESS_DEMOGRAPHIC_DELTA,
  ADDRESS_DEMOGRAPHIC_DURATION_TURNS,
  ADDRESS_EMPHASIS_MAX,
  ADDRESS_EMPHASIS_MIN,
  ADDRESS_TITLE_MAX_LENGTH,
  ADDRESS_TITLE_MIN_LENGTH,
  EXEC_ORDER_AP_COST_PER_STEP,
  EXEC_ORDER_DURATION_TURNS,
  EXEC_ORDER_SLOT_CAP,
  GUBERNATORIAL_ACTION_CAP,
  deliverGovernorAddress,
  issueGovernorOrder,
} from "@ahdclient/engine";
import type { GovernorOfficeActions } from "./GovernorOfficeScreen.js";

export const localGovernorOfficeActions: GovernorOfficeActions = {
  rules: {
    actionCap: GUBERNATORIAL_ACTION_CAP,
    addressActionCost: ADDRESS_ACTION_COST,
    addressCooldownTurns: ADDRESS_COOLDOWN_TURNS,
    addressDurationTurns: ADDRESS_DEMOGRAPHIC_DURATION_TURNS,
    addressTurnoutDelta: ADDRESS_DEMOGRAPHIC_DELTA,
    addressTitleMinLength: ADDRESS_TITLE_MIN_LENGTH,
    addressTitleMaxLength: ADDRESS_TITLE_MAX_LENGTH,
    addressBodyMaxLength: ADDRESS_BODY_MAX_LENGTH,
    addressEmphasisMin: ADDRESS_EMPHASIS_MIN,
    addressEmphasisMax: ADDRESS_EMPHASIS_MAX,
    orderActionCostPerStep: EXEC_ORDER_AP_COST_PER_STEP,
    orderDurationTurns: EXEC_ORDER_DURATION_TURNS,
    orderSlotCap: EXEC_ORDER_SLOT_CAP,
  },
  deliverAddress: deliverGovernorAddress,
  issueOrder: issueGovernorOrder,
};
