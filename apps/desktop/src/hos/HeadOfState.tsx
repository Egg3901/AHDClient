import { useMemo, useState } from "react";
import type { WorldState } from "@rotunda/engine";
import { ACTION_CATALOG } from "@rotunda/engine";
import { game } from "../game.js";
import "./hos.css";

type Props = {
  world: WorldState;
  onWorld: (w: WorldState) => void;
  onToast: (msg: string) => void;
  onBack: () => void;
  onOpenLegislative: () => void;
  onOpenEconomy: () => void;
};

const TAX_FIELDS = ["incomeTax", "domesticCorporateTax", "foreignCorporateTax", "payrollTax", "tariffs", "salesTax"] as const;
const TAX_LABELS: Record<(typeof TAX_FIELDS)[number], string> = {
  incomeTax: "Income tax",
  domesticCorporateTax: "Domestic corporate tax",
  foreignCorporateTax: "Foreign corporate tax",
  payrollTax: "Payroll tax",
  tariffs: "Tariffs",
  salesTax: "Sales tax",
};

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function refreshWorld(onWorld: (w: WorldState) => void): void {
  const w = game.getStateSync();
  if (!w) return;
  onWorld({
    ...w,
    meta: { ...w.meta },
    player: { ...w.player, actionCooldowns: { ...w.player.actionCooldowns } },
    budgets: { ...w.budgets },
    crises: [...w.crises],
  });
}

/**
 * M3 (Lane 12 Head of State mode): the HoS hub. Rendered only when
 * player.mode === "hos" — this is UI-level branching (FRAMEWORK.md
 * "Play modes (binding)" permits it here explicitly; only phase files are
 * forbidden from branching on mode). Three consoles:
 *
 *  - Legislative Agenda: reuses the existing Congress screen (deep-link via
 *    onOpenLegislative) rather than re-implementing bill sponsorship —
 *    Congress.tsx already gates its sponsor/vote UI on player.mode "hos".
 *  - Economic Direction: budget readout + the M1 adjustBudgetSpending/
 *    adjustTaxRate actions (real levers, call calculateBudgetSpending/
 *    calculateBudgetRevenue), with an honest grayed-out row for the
 *    subsidy and command-economy levers the roadmap names but that are not
 *    live in this branch yet (ACTION_CATALOG status "unavailable" +
 *    blockingSystem, same PORT-STUB convention as every other screen).
 *  - War and Foreign Policy: active crises for the player's country with
 *    the existing crisis response actions, plus a grayed section for W32
 *    (cold war tension/alignment/wars), which has not merged into this
 *    branch — named, not hidden.
 */
export function HeadOfStateScreen({ world, onWorld, onToast, onBack, onOpenLegislative, onOpenEconomy }: Props) {
  const countryId = world.player.countryId;
  const countryName = world.countries[countryId]?.name ?? countryId;
  const rulingParty = world.player.hosPartyId ? world.parties[world.player.hosPartyId] ?? null : null;

  const [spendingDrafts, setSpendingDrafts] = useState<Record<string, string>>({});
  const [taxDrafts, setTaxDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const budget = world.budgets[countryId];

  const bills = useMemo(() => world.bills.filter((b) => b.countryId === countryId), [world.bills, countryId]);
  const activeBills = useMemo(() => bills.filter((b) => !["signed", "failed", "withdrawn", "override_failed"].includes(b.status)), [bills]);
  const playerSponsoredBills = useMemo(() => activeBills.filter((b) => b.sponsorId === "player"), [activeBills]);

  const crises = useMemo(
    () => world.crises.filter((c) => c.status === "active" && (c.scope === "global" || c.countryIds.includes(countryId))),
    [world.crises, countryId],
  );

  function runAction(actionId: string, params: Record<string, unknown>, key: string) {
    const result = game.executeAction(actionId, params as never);
    if (result.ok) {
      setErrors((p) => ({ ...p, [key]: null }));
      onToast(result.message);
      refreshWorld(onWorld);
    } else {
      setErrors((p) => ({ ...p, [key]: result.error }));
    }
  }

  const subsidyEntry = ACTION_CATALOG.setSubsidyRate;
  const commandEntry = ACTION_CATALOG.commandEconomyDirective;

  return (
    <div className="hos-hub">
      <header className="hos-header">
        <div>
          <h1>Head of State</h1>
          <p className="muted small">
            {countryName} · {rulingParty ? `${rulingParty.name} (${rulingParty.abbreviation})` : "No bound ruling party"} · Turn {world.meta.turn} · {world.meta.date}
          </p>
        </div>
        <button className="secondary" onClick={onBack}>
          Back
        </button>
      </header>

      <div className="hos-grid">
        <section className="hos-console panel">
          <h2>Legislative Agenda</h2>
          <p className="muted small">
            {activeBills.length} active bill{activeBills.length === 1 ? "" : "s"} in {countryName} · {playerSponsoredBills.length} sponsored by you
          </p>
          <ul className="hos-bill-list">
            {activeBills.slice(0, 5).map((b) => (
              <li key={b.id}>
                <span className="hos-bill-title">{b.title}</span>
                <span className="muted small">{b.status}</span>
              </li>
            ))}
            {activeBills.length === 0 && <li className="muted small">No active bills.</li>}
          </ul>
          <button onClick={onOpenLegislative}>Open Legislative Agenda</button>
        </section>

        <section className="hos-console panel">
          <h2>Economic Direction</h2>
          {!budget && <p className="muted small">No budget data for {countryName}.</p>}
          {budget && (
            <>
              <p className="muted small">
                Surplus {fmt(budget.surplus)} · Revenue {fmt(budget.revenue.total)} · Spending {fmt(budget.spending.total)} · Credit {budget.creditRating}
              </p>

              <h3 className="hos-subhead">Spending</h3>
              <div className="hos-lever-list">
                {Object.entries(budget.spending.byCategory).map(([category, amount]) => {
                  const draft = spendingDrafts[category] ?? String(Math.round(amount));
                  const errKey = `spend:${category}`;
                  return (
                    <div className="hos-lever-row" key={category}>
                      <span className="hos-lever-name">{category}</span>
                      <input
                        value={draft}
                        onChange={(e) => setSpendingDrafts((p) => ({ ...p, [category]: e.target.value }))}
                        className="hos-lever-input"
                      />
                      <button
                        className="secondary small-btn"
                        onClick={() => {
                          const n = Number(draft);
                          if (!Number.isFinite(n) || n < 0) {
                            setErrors((p) => ({ ...p, [errKey]: "Enter a non-negative number" }));
                            return;
                          }
                          runAction("adjustBudgetSpending", { budgetCountryId: countryId, budgetCategory: category, budgetAmount: n }, errKey);
                        }}
                      >
                        Set
                      </button>
                      {errors[errKey] && <span className="error-text small">{errors[errKey]}</span>}
                    </div>
                  );
                })}
              </div>

              <h3 className="hos-subhead">Tax rates (%)</h3>
              <div className="hos-lever-list">
                {TAX_FIELDS.map((field) => {
                  const current = budget.taxRates[field];
                  const draft = taxDrafts[field] ?? String(current);
                  const errKey = `tax:${field}`;
                  return (
                    <div className="hos-lever-row" key={field}>
                      <span className="hos-lever-name">{TAX_LABELS[field]}</span>
                      <input
                        value={draft}
                        onChange={(e) => setTaxDrafts((p) => ({ ...p, [field]: e.target.value }))}
                        className="hos-lever-input"
                      />
                      <button
                        className="secondary small-btn"
                        onClick={() => {
                          const n = Number(draft);
                          if (!Number.isFinite(n) || n < 0 || n > 100) {
                            setErrors((p) => ({ ...p, [errKey]: "Enter 0-100" }));
                            return;
                          }
                          runAction("adjustTaxRate", { budgetCountryId: countryId, taxField: field, taxRate: n }, errKey);
                        }}
                      >
                        Set
                      </button>
                      {errors[errKey] && <span className="error-text small">{errors[errKey]}</span>}
                    </div>
                  );
                })}
              </div>

              <h3 className="hos-subhead">Not yet ported</h3>
              <div className="hos-lever-list">
                <div className="hos-lever-row hos-lever-unavailable">
                  <span className="hos-lever-name">{subsidyEntry.name}</span>
                  <span className="muted small">{subsidyEntry.blockingSystem}</span>
                </div>
                <div className="hos-lever-row hos-lever-unavailable">
                  <span className="hos-lever-name">{commandEntry.name}</span>
                  <span className="muted small">{commandEntry.blockingSystem}</span>
                </div>
              </div>

              <button onClick={onOpenEconomy}>Open Economy Dashboard</button>
            </>
          )}
        </section>

        <section className="hos-console panel">
          <h2>War and Foreign Policy</h2>
          {crises.length === 0 && <p className="muted small">No active crises for {countryName}.</p>}
          <ul className="hos-crisis-list">
            {crises.map((c) => {
              const responded = !!c.playerResponse;
              const errKey = `crisis:${c.id}`;
              return (
                <li key={c.id} className="hos-crisis-row">
                  <div>
                    <strong>{c.name}</strong>
                    <p className="muted small">{c.description}</p>
                  </div>
                  <div className="hos-crisis-actions">
                    {c.kind === "crisis.bankingCrisis" && (
                      <button className="secondary small-btn" disabled={responded} onClick={() => runAction("crisisBailout", {}, errKey)}>
                        Authorize Bailout
                      </button>
                    )}
                    {c.kind === "crisis.recession" && (
                      <button className="secondary small-btn" disabled={responded} onClick={() => runAction("crisisStimulus", {}, errKey)}>
                        Pass Stimulus
                      </button>
                    )}
                    <button className="secondary small-btn" disabled={responded} onClick={() => runAction("crisisRespond", {}, errKey)}>
                      Coordinate Response
                    </button>
                    <button className="secondary small-btn" disabled={responded} onClick={() => runAction("crisisMonitor", {}, errKey)}>
                      Monitor
                    </button>
                  </div>
                  {errors[errKey] && <span className="error-text small">{errors[errKey]}</span>}
                </li>
              );
            })}
          </ul>

          <h3 className="hos-subhead">Not yet ported</h3>
          <div className="hos-lever-list">
            <div className="hos-lever-row hos-lever-unavailable">
              <span className="hos-lever-name">Cold War tension &amp; alignment</span>
              <span className="muted small">W32 (cold war tension, nuclear, wars, alignment, settlement) has not merged into this branch yet.</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
