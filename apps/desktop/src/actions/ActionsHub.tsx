import { useState, useMemo } from "react";
import type { WorldState } from "@rotunda/engine";
import { ACTION_CATALOG, getActionCost, fundraiseQuote } from "@rotunda/engine";
import type { ActionCatalogEntry } from "@rotunda/engine";
import { game } from "../game.js";
import "./actions.css";

type Props = {
  world: WorldState;
  onWorld: (w: WorldState) => void;
  onToast: (msg: string) => void;
};

// Categories: group catalog by intended UI sections
const CATEGORY_ORDER = ["Finance", "Campaign", "Field Operations", "Party", "Other"] as const;
type Category = (typeof CATEGORY_ORDER)[number];

function categoryForEntry(entry: ActionCatalogEntry): Category {
  switch (entry.id) {
    case "fundraise":
    case "buildDonorBase":
    case "convertCash":
      return "Finance";
    case "campaign":
    case "advertise":
    case "poll":
    case "pollLarge":
      return "Campaign";
    case "canvass":
    case "organize":
    case "pressureBoost":
      return "Field Operations";
    case "investInfluence":
      return "Party";
    case "rest":
      return "Other";
    default:
      return "Other";
  }
}

function fundCostForDisplay(entry: ActionCatalogEntry, player: WorldState["player"]): number {
  let fundCost = entry.fundCost;
  if (entry.id === "campaign") {
    const cost = getActionCost(entry, player.donorBaseLevel ?? 0, player.politicalInfluence ?? 0, player.favorability ?? 50);
    const tier = cost;
    const mult = 1 + (tier - 1) * 0.2;
    fundCost = Math.round((20_000 * tier * mult) / 1_000) * 1_000;
  }
  if (entry.id === "advertise") {
    const cost = getActionCost(entry, player.donorBaseLevel ?? 0, player.politicalInfluence ?? 0, player.favorability ?? 50);
    const tierIdx = cost - 5;
    const mult = 1 + tierIdx * 0.2;
    fundCost = Math.round((100_000 * mult) / 1_000) * 1_000;
  }
  if (entry.id === "buildDonorBase") {
    fundCost = Math.round((3_000 + (player.donorBaseLevel ?? 0) * 1_500) / 1_000) * 1_000;
  }
  return fundCost;
}

function cooldownLabel(world: WorldState, actionId: string): string {
  const readyAt = (world.player.actionCooldowns as Record<string, number>)[actionId] ?? 0;
  if (world.meta.turn < readyAt) return `Cooldown until turn ${readyAt}`;
  return "Ready";
}

function isOnCooldown(world: WorldState, actionId: string): boolean {
  const readyAt = (world.player.actionCooldowns as Record<string, number>)[actionId] ?? 0;
  return world.meta.turn < readyAt;
}

export function ActionsHub({ world, onWorld, onToast }: Props) {
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [regionPick, setRegionPick] = useState<Record<string, string>>({});
  const [fundraiseConfirm, setFundraiseConfirm] = useState(false);
  const [convertAmount, setConvertAmount] = useState<string>("");

  const regionsForPlayer = useMemo(() => {
    return Object.values(world.regions).filter((r) => r.countryId === world.player.countryId);
  }, [world.regions, world.player.countryId]);

  const grouped = useMemo(() => {
    const map = new Map<Category, ActionCatalogEntry[]>();
    for (const c of CATEGORY_ORDER) map.set(c, []);
    for (const entry of Object.values(ACTION_CATALOG) as ActionCatalogEntry[]) {
      const cat = categoryForEntry(entry);
      map.get(cat)!.push(entry);
    }
    return map;
  }, []);

  function refreshWorld() {
    const w = game.getStateSync();
    if (w) {
      onWorld({ ...w, meta: { ...w.meta }, player: { ...w.player, actionCooldowns: { ...w.player.actionCooldowns } }, news: [...w.news] });
    }
  }

  function handleExecute(entry: ActionCatalogEntry) {
    // fundraise requires confirm step
    if (entry.id === "fundraise") {
      if (!fundraiseConfirm) {
        setFundraiseConfirm(true);
        return;
      }
    }

    const needsRegion = entry.id === "canvass" || entry.id === "organize" || entry.id === "pressureBoost";
    const params: Record<string, unknown> = {};
    if (needsRegion) {
      const sel = regionPick[entry.id];
      if (!sel) {
        setErrors((p) => ({ ...p, [entry.id]: `Select a region for ${entry.name}` }));
        return;
      }
      params["regionId"] = sel;
    }
    if (entry.id === "convertCash") {
      const amt = convertAmount.trim() === "" ? undefined : Number(convertAmount);
      if (amt !== undefined) {
        if (!Number.isFinite(amt) || amt <= 0) {
          setErrors((p) => ({ ...p, [entry.id]: "Enter a positive amount to convert" }));
          return;
        }
        params["amount"] = amt;
      }
    }

    setErrors((p) => ({ ...p, [entry.id]: null }));
    const result = game.executeAction(entry.id, params as { regionId?: string; amount?: number });
    if (result.ok) {
      const msg = result.message;
      onToast(msg);
      setErrors((p) => ({ ...p, [entry.id]: null }));
      if (entry.id === "fundraise") setFundraiseConfirm(false);
      refreshWorld();
    } else {
      setErrors((p) => ({ ...p, [entry.id]: result.error }));
      if (entry.id === "fundraise") setFundraiseConfirm(false);
    }
  }

  return (
    <div className="actions-hub">
      <h2>Actions</h2>
      <p className="muted small">Costs and eligibility reflect your current stats. Mutations go through the game module only.</p>

      {CATEGORY_ORDER.map((cat) => {
        const entries = grouped.get(cat)!;
        if (entries.length === 0) return null;
        return (
          <section key={cat} className="actions-category">
            <h3 className="actions-category-title">{cat}</h3>
            <div className="actions-grid">
              {entries.map((entry) => {
                const apCost = getActionCost(entry, world.player.donorBaseLevel ?? 0, world.player.politicalInfluence ?? 0, world.player.favorability ?? 50);
                const fundCost = fundCostForDisplay(entry, world.player);
                const onCooldown = isOnCooldown(world, entry.id);
                const cooldownText = cooldownLabel(world, entry.id);
                const unavailable = entry.status === "unavailable";
                const enoughAp = (world.player.actions ?? 0) >= apCost;
                const enoughFunds = fundCost === 0 || (world.player.funds ?? 0) >= fundCost;
                const needsRegion = entry.id === "canvass" || entry.id === "organize" || entry.id === "pressureBoost";
                const eligibilityIssue = !unavailable && !onCooldown
                  ? entry.id === "fundraise" && (world.player.donorBaseLevel ?? 0) === 0
                    ? "No donor base. Use Build Donor Network first."
                    : entry.id === "investInfluence"
                    ? "Only politicians can invest influence"
                    : entry.id === "convertCash" && (world.player.cash ?? 0) <= 0
                    ? "No cash to convert"
                    : !enoughAp
                    ? `Need ${apCost} AP`
                    : !enoughFunds
                    ? `Need ${fundCost.toLocaleString("en-US")} funds`
                    : null
                  : null;

                const cardClass = unavailable ? "action-card unavailable" : onCooldown ? "action-card cooldown" : "action-card";

                return (
                  <div key={entry.id} className={cardClass} data-action-id={entry.id} data-status={entry.status}>
                    <div className="action-card-head">
                      <strong className="action-name">{entry.name}</strong>
                      {unavailable && <span className="action-badge unavailable-badge">PORT-STUB</span>}
                      {onCooldown && <span className="action-badge cooldown-badge">Cooldown</span>}
                    </div>
                    <p className="muted small action-desc">{entry.description}</p>
                    <div className="action-meta">
                      <span className="action-cost">
                        {apCost} AP
                        {fundCost > 0 ? ` · ${fundCost.toLocaleString("en-US")} funds` : ""}
                      </span>
                      <span className="muted small">{cooldownText}</span>
                    </div>
                    {unavailable && entry.blockingSystem && (
                      <div className="muted small action-blocked">Blocked by {entry.blockingSystem}</div>
                    )}
                    {eligibilityIssue && !unavailable && (
                      <div className="muted small action-eligibility">{eligibilityIssue}</div>
                    )}

                    {needsRegion && !unavailable && (
                      <label className="action-region-label">
                        Region
                        <select
                          value={regionPick[entry.id] ?? ""}
                          onChange={(e) => setRegionPick((p) => ({ ...p, [entry.id]: e.target.value }))}
                        >
                          <option value="">Select region</option>
                          {regionsForPlayer.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} ({r.id})
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {entry.id === "convertCash" && !unavailable && (
                      <label className="action-region-label">
                        Amount (cash to convert)
                        <input
                          value={convertAmount}
                          onChange={(e) => setConvertAmount(e.target.value)}
                          placeholder={`max ${world.player.cash.toLocaleString("en-US")}`}
                        />
                      </label>
                    )}

                    {entry.id === "fundraise" && !unavailable && (
                      <div className="fundraise-quote">
                        {(() => {
                          const donor = world.player.donorBaseLevel ?? 0;
                          const inf = world.player.politicalInfluence ?? 0;
                          const quote = fundraiseQuote(donor, inf);
                          const base = 50_000 + donor * 2_000;
                          const mult = 1 + Math.max(0, Math.min(100, inf)) / 100;
                          return (
                            <>
                              <div className="muted small">
                                Quote: {quote.toLocaleString("en-US")} funds
                              </div>
                              <div className="muted small" style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
                                = (50,000 + {donor}×2,000 = {base.toLocaleString("en-US")}) × {mult.toFixed(2)} (1+{inf}/100)
                              </div>
                              {fundraiseConfirm && (
                                <div className="muted small" style={{ color: "#2af57f" }}>
                                  Confirm to execute
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    <div className="action-card-foot">
                      {unavailable ? (
                        <button disabled className="secondary small-btn" title={entry.blockingSystem}>
                          Unavailable
                        </button>
                      ) : entry.id === "fundraise" && !fundraiseConfirm ? (
                        <button
                          className="secondary small-btn"
                          onClick={() => handleExecute(entry)}
                          disabled={onCooldown}
                        >
                          Quote
                        </button>
                      ) : entry.id === "fundraise" && fundraiseConfirm ? (
                        <div className="row" style={{ gap: 8 }}>
                          <button className="small-btn" onClick={() => handleExecute(entry)} disabled={onCooldown}>
                            Confirm fundraise
                          </button>
                          <button className="secondary small-btn" onClick={() => setFundraiseConfirm(false)}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="secondary small-btn"
                          onClick={() => handleExecute(entry)}
                          disabled={unavailable || onCooldown}
                        >
                          Execute
                        </button>
                      )}
                    </div>

                    {errors[entry.id] && (
                      <div className="action-error" role="alert">
                        {errors[entry.id]}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
