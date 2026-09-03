import { useMemo, useState } from "react";
import type { WorldState } from "@ahdclient/engine";
import {
  ACTION_CATALOG,
  cabinetPositionsForCountry,
  EXTRACTABLE_RESOURCES,
} from "@ahdclient/engine";
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
    cabinetMembers: [...w.cabinetMembers],
    cabinetNominations: [...w.cabinetNominations],
    crises: [...w.crises],
    extractionContracts: [...w.extractionContracts],
    prospectingSurveys: [...w.prospectingSurveys],
    politicians: [...w.politicians],
    stateResourceCapacities: { ...w.stateResourceCapacities },
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
 *    the existing crisis response actions, plus live strategic status from
 *    the Cold War, nuclear, conflict, alignment, and settlement systems.
 *  - Cabinet and extraction: existing nomination, survey, and contract
 *    mutations exposed through player-facing controls.
 */
export function HeadOfStateScreen({ world, onWorld, onToast, onBack, onOpenLegislative, onOpenEconomy }: Props) {
  const countryId = world.player.countryId;
  const countryName = world.countries[countryId]?.name ?? countryId;
  const rulingParty = world.player.hosPartyId ? world.parties[world.player.hosPartyId] ?? null : null;

  const [spendingDrafts, setSpendingDrafts] = useState<Record<string, string>>({});
  const [taxDrafts, setTaxDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [extractRegionId, setExtractRegionId] = useState("");
  const [extractResource, setExtractResource] = useState<string>(EXTRACTABLE_RESOURCES[0]);
  const [contractShare, setContractShare] = useState("0.1");
  const [contractRoyalty, setContractRoyalty] = useState("0.02");
  const [contractTerm, setContractTerm] = useState("48");
  const [contractFee, setContractFee] = useState("100000");
  const [cabinetPositionId, setCabinetPositionId] = useState("");
  const [cabinetNomineeId, setCabinetNomineeId] = useState("");

  const budget = world.budgets[countryId];

  const bills = useMemo(() => world.bills.filter((b) => b.countryId === countryId), [world.bills, countryId]);
  const activeBills = useMemo(() => bills.filter((b) => !["signed", "failed", "withdrawn", "override_failed"].includes(b.status)), [bills]);
  const playerSponsoredBills = useMemo(() => activeBills.filter((b) => b.sponsorId === "player"), [activeBills]);

  const crises = useMemo(
    () => world.crises.filter((c) => c.status === "active" && (c.scope === "global" || c.countryIds.includes(countryId))),
    [world.crises, countryId],
  );
  const regions = useMemo(
    () => Object.values(world.regions)
      .filter((region) => region.countryId === countryId)
      .sort((left, right) => left.name.localeCompare(right.name)),
    [countryId, world.regions],
  );
  const effectiveExtractRegionId = regions.some((region) => region.id === extractRegionId)
    ? extractRegionId
    : regions[0]?.id ?? "";
  const currentYear = Number(world.meta.date.slice(0, 4));
  const openCabinetPositions = useMemo(() => {
    const filled = new Set(world.cabinetMembers
      .filter((member) => member.countryId === countryId)
      .map((member) => member.positionId));
    const pending = new Set(world.cabinetNominations
      .filter((nomination) => nomination.countryId === countryId && ["proposed", "active"].includes(nomination.status))
      .map((nomination) => nomination.positionId));
    return cabinetPositionsForCountry(countryId)
      .filter((position) => (position.yearEnabled ?? 0) <= currentYear)
      .filter((position) => !filled.has(position.id) && !pending.has(position.id));
  }, [countryId, currentYear, world.cabinetMembers, world.cabinetNominations]);
  const eligibleCabinetNominees = useMemo(() => {
    const seated = new Set(world.cabinetMembers
      .filter((member) => member.countryId === countryId)
      .map((member) => member.characterId));
    const pending = new Set(world.cabinetNominations
      .filter((nomination) => nomination.countryId === countryId && ["proposed", "active"].includes(nomination.status))
      .map((nomination) => nomination.nomineeId));
    return world.politicians
      .filter((politician) => politician.countryId === countryId && !seated.has(politician.id) && !pending.has(politician.id))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [countryId, world.cabinetMembers, world.cabinetNominations, world.politicians]);
  const effectiveCabinetPositionId = openCabinetPositions.some((position) => position.id === cabinetPositionId)
    ? cabinetPositionId
    : openCabinetPositions[0]?.id ?? "";
  const effectiveCabinetNomineeId = eligibleCabinetNominees.some((politician) => politician.id === cabinetNomineeId)
    ? cabinetNomineeId
    : eligibleCabinetNominees[0]?.id ?? "";

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

  function issueExtractionContract() {
    const values = {
      share: Number(contractShare),
      royaltyRatePerTurn: Number(contractRoyalty),
      termTurns: Number(contractTerm),
      signingFeeAnchor: Number(contractFee),
    };
    if (
      !effectiveExtractRegionId ||
      !EXTRACTABLE_RESOURCES.includes(extractResource as (typeof EXTRACTABLE_RESOURCES)[number]) ||
      !Number.isFinite(values.share) ||
      !Number.isFinite(values.royaltyRatePerTurn) ||
      !Number.isInteger(values.termTurns) ||
      !Number.isFinite(values.signingFeeAnchor) ||
      values.signingFeeAnchor < 0
    ) {
      setErrors((current) => ({ ...current, extraction: "Enter a valid region, resource, share, royalty, term, and fee." }));
      return;
    }
    runAction("issueExtractionContract", {
      regionId: effectiveExtractRegionId,
      resource: extractResource,
      ...values,
    }, "extraction");
  }

  function nominateCabinetMember() {
    const nominee = eligibleCabinetNominees.find((politician) => politician.id === effectiveCabinetNomineeId);
    if (!effectiveCabinetPositionId || nominee === undefined) {
      setErrors((current) => ({ ...current, cabinet: "Choose an open cabinet position and an eligible nominee." }));
      return;
    }
    try {
      const id = game.proposeCabinetNomination({
        countryId,
        positionId: effectiveCabinetPositionId,
        nomineeId: nominee.id,
        nomineeName: nominee.name,
        nomineeParty: nominee.partyId,
        proposedBy: "player",
        proposedByName: world.player.name,
        votingEndsOnTurn: world.meta.turn + 24,
      });
      setErrors((current) => ({ ...current, cabinet: null }));
      onToast(`Cabinet nomination opened: ${id}`);
      refreshWorld(onWorld);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        cabinet: error instanceof Error ? error.message : String(error),
      }));
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
          <h2>Cabinet</h2>
          <p className="muted small">
            {world.cabinetMembers.filter((member) => member.countryId === countryId).length} filled seats · {world.cabinetNominations.filter((nomination) => nomination.countryId === countryId && ["proposed", "active"].includes(nomination.status)).length} active nominations
          </p>
          {openCabinetPositions.length === 0 || eligibleCabinetNominees.length === 0 ? (
            <p className="muted small">No open position and eligible nominee pair is available.</p>
          ) : (
            <>
              <label className="hos-control-label">
                Position
                <select value={effectiveCabinetPositionId} onChange={(event) => setCabinetPositionId(event.target.value)}>
                  {openCabinetPositions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
                </select>
              </label>
              <label className="hos-control-label">
                Nominee
                <select value={effectiveCabinetNomineeId} onChange={(event) => setCabinetNomineeId(event.target.value)}>
                  {eligibleCabinetNominees.map((politician) => <option key={politician.id} value={politician.id}>{politician.name}</option>)}
                </select>
              </label>
              <button onClick={nominateCabinetMember}>Open confirmation vote</button>
            </>
          )}
          {errors["cabinet"] && <span className="error-text small" role="alert">{errors["cabinet"]}</span>}
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

          <h3 className="hos-subhead">Strategic status</h3>
          <div className="hos-strategic-grid">
            <span>Cold War tension <strong>{world.coldWarTension.value.toFixed(1)}</strong></span>
            <span>Active conflicts <strong>{world.conflicts.filter((conflict) => conflict.status !== "resolved" && (conflict.sideA.countries.includes(countryId) || conflict.sideB.countries.includes(countryId))).length}</strong></span>
            <span>Warheads <strong>{world.nuclearPrograms[countryId]?.warheads ?? 0}</strong></span>
            <span>Non-aligned <strong>{world.alignments[countryId]?.nonAligned ?? 100}%</strong></span>
          </div>
          <p className="muted small">The simulation advances tension, nuclear programs, conflicts, alignment, and settlements each turn. Player-issued military and alignment commands are not represented by the engine.</p>
        </section>

        <section className="hos-console panel">
          <h2>Resources and Extraction</h2>
          <p className="muted small">
            Commission surveys and offer contracts to the national extraction corporation. Survey costs draw from the national treasury.
          </p>
          {regions.length === 0 ? (
            <p className="muted small">No regions are available for {countryName}.</p>
          ) : (
            <>
              <label className="hos-control-label">
                Region
                <select value={effectiveExtractRegionId} onChange={(event) => setExtractRegionId(event.target.value)}>
                  {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
                </select>
              </label>
              <label className="hos-control-label">
                Resource
                <select value={extractResource} onChange={(event) => setExtractResource(event.target.value)}>
                  {EXTRACTABLE_RESOURCES.map((resource) => <option key={resource} value={resource}>{resource.replace(/_/g, " ")}</option>)}
                </select>
              </label>
              <button className="secondary" onClick={() => runAction("launchProspect", { regionId: effectiveExtractRegionId, resource: extractResource }, "extraction")}>Commission survey</button>
              <h3 className="hos-subhead">Contract terms</h3>
              <div className="hos-contract-grid">
                <label className="hos-control-label">Capacity share<input value={contractShare} onChange={(event) => setContractShare(event.target.value)} /></label>
                <label className="hos-control-label">Royalty per turn<input value={contractRoyalty} onChange={(event) => setContractRoyalty(event.target.value)} /></label>
                <label className="hos-control-label">Term in turns<input value={contractTerm} onChange={(event) => setContractTerm(event.target.value)} /></label>
                <label className="hos-control-label">Signing fee<input value={contractFee} onChange={(event) => setContractFee(event.target.value)} /></label>
              </div>
              <button onClick={issueExtractionContract}>Offer extraction contract</button>
            </>
          )}
          {errors["extraction"] && <span className="error-text small" role="alert">{errors["extraction"]}</span>}
          <p className="muted small">
            {world.prospectingSurveys.filter((survey) => survey.countryId === countryId && survey.status === "active").length} active surveys · {world.extractionContracts.filter((contract) => contract.countryId === countryId && ["offered", "active"].includes(contract.status)).length} live contracts
          </p>
        </section>
      </div>
    </div>
  );
}
