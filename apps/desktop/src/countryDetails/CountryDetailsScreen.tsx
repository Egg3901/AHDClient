import { useMemo } from "react";
import type { ReactNode } from "react";
import type { WorldState } from "@ahdclient/engine";
import { COUNTRY_DETAIL_ROUTES, isCountryDetailRoute } from "./routes.js";
import "./countryDetails.css";

export interface CountryDetailsScreenProps {
  world: WorldState;
  countryId: string;
  /** Stable local route id (see routes.ts). Never a URL. */
  routeId: string;
  onBack: () => void;
}

function fmtInt(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-US");
}

function fmtMoney(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US");
}

function fmtFloat(value: number | null | undefined, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function fmtPct(value: number | null | undefined, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function fmtText(value: string | null | undefined): string {
  if (typeof value !== "string" || value === "") return "—";
  return value;
}

function partyAbbrev(world: WorldState, partyId: string | null | undefined): string {
  if (partyId === null || partyId === undefined || partyId === "") return "—";
  return world.parties[partyId]?.abbreviation ?? partyId;
}

function politicianName(world: WorldState, id: string | null | undefined): string {
  if (id === null || id === undefined || id === "") return "—";
  if (id === "player") return world.player.name;
  return world.politicians.find((p) => p.id === id)?.name ?? id;
}

function regionName(world: WorldState, regionId: string): string {
  return world.regions[regionId]?.name ?? regionId;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel cd-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="cd-empty">{children}</p>;
}

function Table({
  headers,
  rows,
  caption,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
  caption?: string;
}) {
  return (
    <div className="cd-table-wrap">
      <table className="cd-table">
        {caption !== undefined ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeyValues({ entries }: { entries: Array<[string, string]> }) {
  return (
    <dl className="cd-kv">
      {entries.map(([key, value]) => (
        <div className="cd-kv-row" key={key}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CountryDetailsScreen({
  world,
  countryId,
  routeId,
  onBack,
}: CountryDetailsScreenProps) {
  const country = world.countries[countryId];
  const supported = isCountryDetailRoute(routeId);
  const route = COUNTRY_DETAIL_ROUTES.find((r) => r.id === routeId) ?? null;

  const context = useMemo(() => {
    if (country === undefined) return `Unknown country ${countryId}`;
    return `${country.name} (${country.id}) · Turn ${world.meta.turn} · ${world.meta.date} · era ${world.meta.era}`;
  }, [country, countryId, world.meta]);

  return (
    <div className="cd-screen">
      <header className="cd-header">
        <div className="row spread">
          <div className="row cd-title-row">
            <h1 className="cd-title">{route?.heading ?? "Unknown destination"}</h1>
            <span className="muted small cd-subtitle">{context}</span>
          </div>
          <button className="secondary small-btn" onClick={onBack}>
            Back to dashboard
          </button>
        </div>
        {route !== null ? <p className="muted small cd-blurb">{route.blurb}</p> : null}
      </header>

      {country === undefined ? (
        <Section title="Unknown country">
          <Empty>
            No country {countryId} in this world (turn {world.meta.turn}). It may belong to a
            different era pack. Go back and pick a country from this world.
          </Empty>
        </Section>
      ) : !supported || route === null ? (
        <Section title="Unsupported destination">
          <Empty>
            Route {routeId} is not served by the local country-details screen. Supported route
            ids: {COUNTRY_DETAIL_ROUTES.map((r) => r.id).join(", ")}.
          </Empty>
        </Section>
      ) : (
        <DetailBody world={world} countryId={countryId} routeId={routeId} />
      )}
    </div>
  );
}

function DetailBody({
  world,
  countryId,
  routeId,
}: {
  world: WorldState;
  countryId: string;
  routeId: string;
}) {
  switch (routeId) {
    case "nation.politics.politicians":
      return <PoliticiansSection world={world} countryId={countryId} />;
    case "nation.politics.approval":
      return <ApprovalSection world={world} countryId={countryId} />;
    case "nation.politics.referendums":
      return <ReferendumsSection world={world} countryId={countryId} />;
    case "nation.economy.budget":
      return <BudgetSection world={world} countryId={countryId} />;
    case "nation.government.policy":
      return <PolicySection world={world} countryId={countryId} />;
    case "nation.government.scotus":
      return <ScotusSection world={world} countryId={countryId} />;
    case "nation.economy.banking":
    case "world.banking":
      return <BankingSection world={world} countryId={countryId} />;
    case "world.forex":
      return <ForexSection world={world} countryId={countryId} />;
    case "nation.economy.unions":
      return <UnionsSection world={world} countryId={countryId} scopeAll={false} />;
    case "world.unions":
      return <UnionsSection world={world} countryId={countryId} scopeAll={true} />;
    case "nation.economy.command":
    case "nation.economy.nationalization":
      return <CommandSection world={world} countryId={countryId} />;
    case "nation.economy.metrics":
      return <MetricsSection world={world} countryId={countryId} />;
    case "world.conflicts":
      return <ConflictsSection world={world} countryId={countryId} />;
    case "nation.defense.forces":
      return <ForcesSection world={world} countryId={countryId} />;
    default:
      return (
        <Section title="Unsupported destination">
          <Empty>
            Route {routeId} is not served by the local country-details screen. Supported route
            ids: {COUNTRY_DETAIL_ROUTES.map((r) => r.id).join(", ")}.
          </Empty>
        </Section>
      );
  }
}

function PoliticiansSection({ world, countryId }: { world: WorldState; countryId: string }) {
  const rows = useMemo(
    () =>
      world.politicians
        .filter((p) => p.countryId === countryId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [world, countryId],
  );
  const countryName = world.countries[countryId]?.name ?? countryId;
  if (rows.length === 0) {
    return (
      <Section title="Politicians">
        <Empty>No politicians seeded for {countryName}.</Empty>
      </Section>
    );
  }
  return (
    <Section title={`Politicians (${rows.length})`}>
      <Table
        headers={[
          "Name",
          "Party",
          "Chamber",
          "Age",
          "Econ",
          "Social",
          "Favorability",
          "Infamy",
          "Funds",
          "Actions",
        ]}
        rows={rows.map((p) => [
          p.name,
          partyAbbrev(world, p.partyId),
          p.chamberKey === "" ? "Unseated" : p.chamberKey,
          String(p.age),
          fmtFloat(p.ideology.economic),
          fmtFloat(p.ideology.social),
          String(p.favorability),
          String(p.infamy),
          fmtMoney(p.funds),
          String(p.actions),
        ])}
      />
    </Section>
  );
}

function ApprovalSection({ world, countryId }: { world: WorldState; countryId: string }) {
  const supports = useMemo(
    () =>
      Object.values(world.candidateSupports)
        .filter((s) => s.countryId === countryId)
        .sort((a, b) => a.id.localeCompare(b.id)),
    [world, countryId],
  );
  const partyRegions = useMemo(
    () =>
      Object.values(world.partyRegions)
        .filter((r) => r.countryId === countryId)
        .sort(
          (a, b) =>
            a.regionId.localeCompare(b.regionId) || a.partyId.localeCompare(b.partyId),
        ),
    [world, countryId],
  );
  const pools = useMemo(
    () =>
      Object.values(world.electoratePools)
        .filter((p) => p.countryId === countryId)
        .sort((a, b) => a.regionId.localeCompare(b.regionId)),
    [world, countryId],
  );
  const turnouts = useMemo(
    () =>
      Object.values(world.regionTurnouts)
        .filter((t) => t.countryId === countryId)
        .sort((a, b) => a.regionId.localeCompare(b.regionId)),
    [world, countryId],
  );
  const pressures = useMemo(
    () =>
      Object.values(world.partyPressures)
        .filter((p) => p.countryId === countryId)
        .sort(
          (a, b) =>
            a.partyId.localeCompare(b.partyId) || a.regionId.localeCompare(b.regionId),
        ),
    [world, countryId],
  );
  return (
    <>
      <Section title={`Candidate support (${supports.length})`}>
        {supports.length === 0 ? (
          <Empty>No candidate support rows for this country this turn.</Empty>
        ) : (
          <Table
            headers={["Candidate", "Party", "Region", "Support", "Accrual legs", "Status"]}
            rows={supports.map((s) => [
              politicianName(world, s.id),
              partyAbbrev(world, s.partyId),
              s.regionId === undefined ? "—" : regionName(world, s.regionId),
              fmtFloat(s.support),
              s.supportAccrual.length === 0
                ? "none"
                : s.supportAccrual
                    .map((leg) => `${fmtFloat(leg.amountPerTurn)}/t x${leg.turnsRemaining}`)
                    .join("; "),
              s.status,
            ])}
          />
        )}
      </Section>
      <Section title={`Party organization and registration (${partyRegions.length})`}>
        {partyRegions.length === 0 ? (
          <Empty>No per-region party organization rows for this country.</Empty>
        ) : (
          <Table
            headers={["Region", "Party", "Organization", "Registration"]}
            rows={partyRegions.map((r) => [
              regionName(world, r.regionId),
              partyAbbrev(world, r.partyId),
              fmtInt(r.organization),
              fmtInt(r.registration),
            ])}
          />
        )}
      </Section>
      <Section title={`Electorate pools (${pools.length})`}>
        {pools.length === 0 ? (
          <Empty>No electorate pool rows for this country.</Empty>
        ) : (
          <Table
            headers={["Region", "Independent", "Unregistered"]}
            rows={pools.map((p) => [
              regionName(world, p.regionId),
              fmtInt(p.independent),
              fmtInt(p.unregistered),
            ])}
          />
        )}
      </Section>
      <Section title={`Turnout modifiers (${turnouts.length})`}>
        {turnouts.length === 0 ? (
          <Empty>No turnout modifier rows for this country.</Empty>
        ) : (
          <Table
            headers={["Region", "Modifiers", "Last decay turn"]}
            rows={turnouts.map((t) => [
              regionName(world, t.regionId),
              Object.entries(t.modifiers).length === 0
                ? "neutral"
                : Object.entries(t.modifiers)
                    .map(
                      ([category, groups]) =>
                        `${category}: ${Object.entries(groups)
                          .map(([group, value]) => `${group} ${fmtFloat(value)}`)
                          .join(", ")}`,
                    )
                    .join("; "),
              String(t.lastDecayAppliedTurn),
            ])}
          />
        )}
      </Section>
      <Section title={`Party pressure (${pressures.length})`}>
        {pressures.length === 0 ? (
          <Empty>No party-strength pressure rows for this country.</Empty>
        ) : (
          <Table
            headers={["Party", "Region", "Pressure"]}
            rows={pressures.map((p) => [
              partyAbbrev(world, p.partyId),
              regionName(world, p.regionId),
              fmtFloat(p.value),
            ])}
          />
        )}
      </Section>
    </>
  );
}

function ReferendumsSection({ world, countryId }: { world: WorldState; countryId: string }) {
  const rows = useMemo(
    () =>
      world.referendums
        .filter((r) => r.countryId === countryId)
        .sort((a, b) => a.id.localeCompare(b.id)),
    [world, countryId],
  );
  const countryName = world.countries[countryId]?.name ?? countryId;
  if (rows.length === 0) {
    return (
      <Section title="Referendum records">
        <Empty>
          No referendum records for {countryName}. The engine holds records only while a
          devolution referendum lifecycle is live.
        </Empty>
      </Section>
    );
  }
  return (
    <Section title={`Referendums (${rows.length})`}>
      <Table
        headers={[
          "Id",
          "Region",
          "Kind",
          "Status",
          "Yes share",
          "Turnout",
          "Passed",
          "Requested",
          "Granted",
          "Resolved",
        ]}
        rows={rows.map((r) => [
          r.id,
          regionName(world, r.regionId),
          r.kind,
          r.status,
          fmtFloat(r.yesShare),
          r.turnout === undefined ? "—" : fmtFloat(r.turnout),
          r.passed === undefined ? "—" : r.passed ? "yes" : "no",
          String(r.requestedTurn),
          r.grantedTurn === null ? "—" : String(r.grantedTurn),
          r.resolvedTurn === undefined ? "—" : String(r.resolvedTurn),
        ])}
      />
    </Section>
  );
}

function BudgetSection({ world, countryId }: { world: WorldState; countryId: string }) {
  const budget = world.budgets[countryId];
  const countryName = world.countries[countryId]?.name ?? countryId;
  if (budget === undefined) {
    return (
      <Section title="Budget records">
        <Empty>No national budget for {countryName} in this world.</Empty>
      </Section>
    );
  }
  return (
    <>
      <Section title="Budget totals">
        <KeyValues
          entries={[
            ["Fiscal year", String(budget.fiscalYear)],
            ["Currency", budget.currencyCode],
            ["GDP (local)", fmtMoney(budget.gdp)],
            ["Population", fmtInt(budget.population)],
            ["Revenue total", fmtMoney(budget.revenue.total)],
            ["Spending total", fmtMoney(budget.spending.total)],
            ["Surplus", fmtMoney(budget.surplus)],
            ["Treasury balance", fmtMoney(budget.treasuryBalance)],
            ["Debt principal", fmtMoney(budget.debt.principal)],
            ["Debt interest rate", fmtPct(budget.debt.interestRate)],
            ["Debt ceiling", fmtMoney(budget.debt.ceiling)],
            ["Credit rating", budget.creditRating],
            [
              "Investor confidence",
              budget.investorConfidence === undefined
                ? "—"
                : `${fmtFloat(budget.investorConfidence)} (turn ${budget.investorConfidenceUpdatedAtTurn ?? "—"})`,
            ],
            ["State ownership concentration", fmtFloat(budget.stateOwnershipConcentration)],
          ]}
        />
      </Section>
      <Section title="Revenue">
        <Table
          headers={["Source", "Amount (local)"]}
          rows={[
            ["Income tax", fmtMoney(budget.revenue.incomeTax)],
            ["Domestic corporate tax", fmtMoney(budget.revenue.domesticCorporateTax)],
            ["Foreign corporate tax", fmtMoney(budget.revenue.foreignCorporateTax)],
            ["Payroll tax", fmtMoney(budget.revenue.payrollTax)],
            ["Tariffs", fmtMoney(budget.revenue.tariffs)],
            ["Sales tax", fmtMoney(budget.revenue.salesTax)],
            ["Other", fmtMoney(budget.revenue.other)],
            ["Total", fmtMoney(budget.revenue.total)],
          ]}
        />
      </Section>
      <Section title="Spending">
        <Table
          headers={["Category", "Amount (local)"]}
          rows={[
            ...Object.entries(budget.spending.byCategory)
              .sort(([a], [b]) => a.localeCompare(b))
              .map<[string, string]>(([category, amount]) => [category, fmtMoney(amount)]),
            ["State grants", fmtMoney(budget.spending.stateGrants)],
            ["Debt interest", fmtMoney(budget.spending.debtInterest)],
            ["Total", fmtMoney(budget.spending.total)],
          ]}
        />
      </Section>
    </>
  );
}

function PolicySection({ world, countryId }: { world: WorldState; countryId: string }) {
  const laws = useMemo(
    () =>
      world.enactedLaws
        .filter((law) => law.countryId === countryId)
        .sort((a, b) => a.enactedAtTurn - b.enactedAtTurn || a.id.localeCompare(b.id)),
    [world, countryId],
  );
  const countryName = world.countries[countryId]?.name ?? countryId;
  if (laws.length === 0) {
    return (
      <Section title="Enacted laws">
        <Empty>No enacted national laws for {countryName}.</Empty>
      </Section>
    );
  }
  return (
    <Section title={`Enacted Policy (${laws.length})`}>
      <Table
        headers={[
          "Law",
          "Enacting bill",
          "Level",
          "Scope",
          "Enacted turn",
          "Legislation type",
          "Policy option",
          "Direction",
          "Repealed",
        ]}
        rows={laws.map((law) => {
          const bill = world.bills.find((b) => b.id === law.billId);
          const ledger = world.policyLedger[law.billId];
          return [
            law.id,
            bill?.title ?? law.billId,
            String(law.level),
            law.scope,
            String(law.enactedAtTurn),
            ledger?.legislationTypeId ?? "—",
            ledger?.policyOptionId ?? "—",
            ledger === undefined ? "—" : String(ledger.effectDirection),
            law.repealedAtTurn === undefined ? "active" : `turn ${law.repealedAtTurn}`,
          ];
        })}
      />
    </Section>
  );
}

function ScotusSection({ world, countryId }: { world: WorldState; countryId: string }) {
  const seats = useMemo(
    () =>
      world.supremeCourtSeats
        .filter((s) => s.countryId === countryId)
        .sort((a, b) => a.seatNumber - b.seatNumber),
    [world, countryId],
  );
  const nominations = useMemo(
    () =>
      world.scotusNominations
        .filter((n) => n.countryId === countryId)
        .sort((a, b) => a.proposedAtTurn - b.proposedAtTurn),
    [world, countryId],
  );
  const docket = useMemo(
    () =>
      world.docketCases
        .filter((c) => c.countryId === countryId)
        .sort((a, b) => a.decisionYear - b.decisionYear || a.id.localeCompare(b.id)),
    [world, countryId],
  );
  const jrCases = useMemo(
    () =>
      world.ukJudicialReviewCases
        .filter((c) => c.countryId === countryId)
        .sort((a, b) => a.decidedAtTurn - b.decidedAtTurn),
    [world, countryId],
  );
  const countryName = world.countries[countryId]?.name ?? countryId;
  if (seats.length === 0 && nominations.length === 0 && docket.length === 0 && jrCases.length === 0) {
    return (
      <Section title="Court records">
        <Empty>
          No court seats, nominations, docket cases, or judicial-review records for{" "}
          {countryName}. The engine seeds the full court apparatus for the US only.
        </Empty>
      </Section>
    );
  }
  return (
    <>
      <Section title={`Court seats (${seats.length})`}>
        {seats.length === 0 ? (
          <Empty>No court seats for {countryName}.</Empty>
        ) : (
          <Table
            headers={[
              "Seat",
              "Justice",
              "Mode",
              "Party",
              "Econ lean",
              "Social lean",
              "Seated turn",
              "Divergent",
            ]}
            rows={seats.map((s) => [
              String(s.seatNumber),
              fmtText(s.justiceName),
              fmtText(s.justiceMode),
              fmtText(s.justiceParty),
              s.economicLean === null ? "—" : fmtFloat(s.economicLean),
              s.socialLean === null ? "—" : fmtFloat(s.socialLean),
              s.seatedAtTurn === null ? "vacant" : String(s.seatedAtTurn),
              s.isDivergent ? "yes" : "no",
            ])}
          />
        )}
      </Section>
      <Section title={`Nominations (${nominations.length})`}>
        {nominations.length === 0 ? (
          <Empty>No nominations on record for {countryName}.</Empty>
        ) : (
          <Table
            headers={[
              "Seat",
              "Nominee",
              "Mode",
              "Party",
              "Proposed by",
              "Status",
              "For",
              "Against",
              "Abstain",
              "Proposed turn",
            ]}
            rows={nominations.map((n) => [
              String(n.seatNumber),
              n.nomineeName,
              n.nomineeMode,
              fmtText(n.nomineeParty),
              fmtText(n.proposedBy),
              n.status,
              String(n.votesFor),
              String(n.votesAgainst),
              String(n.votesAbstain),
              String(n.proposedAtTurn),
            ])}
          />
        )}
      </Section>
      <Section title={`Docket (${docket.length})`}>
        {docket.length === 0 ? (
          <Empty>No docket cases for {countryName}.</Empty>
        ) : (
          <Table
            headers={["Case", "Axis", "Status", "Outcome", "Decision year", "Decided turn"]}
            rows={docket.map((c) => [
              c.title,
              c.axis,
              c.status,
              c.outcome ?? "—",
              String(c.decisionYear),
              c.decidedAtTurn === undefined ? "—" : String(c.decidedAtTurn),
            ])}
          />
        )}
      </Section>
      {jrCases.length > 0 ? (
        <Section title={`Judicial review (${jrCases.length})`}>
          <Table
            headers={["Case", "Template", "Axis", "Majority", "Created turn", "Decided turn"]}
            rows={jrCases.map((c) => [
              c.title,
              c.templateKey,
              c.axis,
              String(c.majoritySide),
              String(c.createdAtTurn),
              String(c.decidedAtTurn),
            ])}
          />
        </Section>
      ) : null}
    </>
  );
}

function BankingSection({ world, countryId }: { world: WorldState; countryId: string }) {
  const central = world.centralBanks[countryId];
  const countryName = world.countries[countryId]?.name ?? countryId;
  const banks = useMemo(
    () =>
      Object.values(world.corporations)
        .filter((c) => c.countryId === countryId && c.bankCharter !== undefined)
        .sort((a, b) => a.id.localeCompare(b.id)),
    [world, countryId],
  );
  const corpIds = useMemo(() => new Set(banks.map((b) => b.id)), [banks]);
  const loans = useMemo(
    () =>
      world.bankLoans
        .filter((l) => corpIds.has(l.bankCorpId))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [world.bankLoans, corpIds],
  );
  const insurance = world.depositInsurance[countryId];
  return (
    <>
      <Section title="Central bank">
        {central === undefined ? (
          <Empty>No central bank for {countryName} in this world.</Empty>
        ) : (
          <KeyValues
            entries={[
              ["Policy (prime) rate", fmtPct(central.primeRate)],
              ["Chair mode", central.chairMode],
              ["Chair alignment", central.chairAlignment ?? "neutral"],
              ["Chair scrutiny", fmtInt(central.chairInfamy)],
              ["Resolve streak", `${central.resolveStreak} turns`],
              [
                "Last rate move",
                central.lastRateChangeTurn === null
                  ? "none yet"
                  : `turn ${central.lastRateChangeTurn}`,
              ],
              ["Chair term expires", `turn ${central.chairTermExpiresAtTurn}`],
              ["Chair appointed by", fmtText(central.chairAppointedBy)],
            ]}
          />
        )}
      </Section>
      <Section title={`Private banks (${banks.length})`}>
        {banks.length === 0 ? (
          <Empty>No chartered private banks for {countryName}.</Empty>
        ) : (
          <Table
            headers={[
              "Bank",
              "Sector",
              "Charter",
              "Cash reserves",
              "NPC deposits",
              "Total deposits",
              "Total loans",
              "Confidence",
              "Band",
              "Panic turns",
            ]}
            rows={banks.map((b) => {
              const charter = b.bankCharter;
              if (charter === undefined) return [b.id, b.sectorType, "—", "—", "—", "—", "—", "—", "—", "—"];
              return [
                b.id,
                b.sectorType,
                `${charter.status} (turn ${charter.charteredTurn})`,
                fmtMoney(charter.cashReserves),
                fmtMoney(charter.npcDeposits),
                fmtMoney(charter.totalDeposits),
                fmtMoney(charter.totalLoans),
                fmtFloat(charter.confidence, 2),
                charter.warningBand,
                String(charter.panicTurns),
              ];
            })}
          />
        )}
      </Section>
      <Section title={`Bank loans (${loans.length})`}>
        {loans.length === 0 ? (
          <Empty>
            No bank loans on the books of {countryName} banks. The engine books household
            tranches through the banking turn and has no loan-origination action yet.
          </Empty>
        ) : (
          <Table
            headers={[
              "Loan",
              "Bank",
              "Borrower",
              "Principal",
              "Outstanding",
              "Rate",
              "Status",
              "Originated",
              "Term",
            ]}
            rows={loans.map((l) => [
              l.id,
              l.bankCorpId,
              `${l.borrowerType}${l.borrowerId === null ? "" : ` ${l.borrowerId}`}`,
              fmtMoney(l.principal),
              fmtMoney(l.outstanding),
              fmtPct(l.ratePercent / 100),
              l.status,
              `turn ${l.originatedTurn}`,
              `${l.termTurns} turns`,
            ])}
          />
        )}
      </Section>
      <Section title="Deposit insurance">
        {insurance === undefined ? (
          <Empty>No deposit-insurance fund for {countryName}.</Empty>
        ) : (
          <KeyValues
            entries={[
              ["Balance", fmtMoney(insurance.balance)],
              ["Insured cap", fmtMoney(insurance.insuredCap)],
              ["Premiums collected", fmtMoney(insurance.premiumsCollectedLifetime)],
              ["Payouts", fmtMoney(insurance.payoutsLifetime)],
            ]}
          />
        )}
      </Section>
    </>
  );
}

function ForexSection({ world, countryId }: { world: WorldState; countryId: string }) {
  const rate = world.exchangeRates[countryId];
  const all = useMemo(
    () =>
      Object.values(world.exchangeRates).sort((a, b) => a.countryId.localeCompare(b.countryId)),
    [world],
  );
  const countryName = world.countries[countryId]?.name ?? countryId;
  return (
    <>
      <Section title="Country rate">
        {rate === undefined ? (
          <Empty>
            No exchange-rate record for {countryName}. The engine tracks one rate per
            forex-active country only.
          </Empty>
        ) : (
          <KeyValues
            entries={[
              ["Currency", rate.currencyCode],
              ["Rate (local per $1 anchor)", fmtFloat(rate.rate, 4)],
              ["Peg calibration", fmtFloat(rate.baseRate, 4)],
              ["Macro target", fmtFloat(rate.macroTarget, 4)],
              [
                "Drift from peg",
                rate.baseRate === 0
                  ? "—"
                  : `${fmtFloat(((rate.rate - rate.baseRate) / rate.baseRate) * 100)}%`,
              ],
              ["Regime", rate.regime],
              ["Updated turn", String(rate.updatedTurn)],
              ["History points", String(rate.rateHistory.length)],
            ]}
          />
        )}
      </Section>
      <Section title={`All rates (${all.length})`}>
        {all.length === 0 ? (
          <Empty>No exchange rates in this world.</Empty>
        ) : (
          <Table
            headers={[
              "Country",
              "Currency",
              "Rate (local per $1)",
              "Peg",
              "Target",
              "Regime",
              "Updated",
            ]}
            rows={all.map((r) => [
              world.countries[r.countryId]?.name ?? r.countryId,
              r.currencyCode,
              fmtFloat(r.rate, 4),
              fmtFloat(r.baseRate, 4),
              fmtFloat(r.macroTarget, 4),
              r.regime,
              `turn ${r.updatedTurn}`,
            ])}
          />
        )}
      </Section>
    </>
  );
}

function UnionsSection({
  world,
  countryId,
  scopeAll,
}: {
  world: WorldState;
  countryId: string;
  scopeAll: boolean;
}) {
  const rows = useMemo(
    () =>
      Object.values(world.unions)
        .filter((u) => scopeAll || u.countryId === countryId)
        .sort((a, b) => a.id.localeCompare(b.id)),
    [world, countryId, scopeAll],
  );
  const countryName = world.countries[countryId]?.name ?? countryId;
  if (rows.length === 0) {
    return (
      <Section title="Union roster">
        <Empty>
          {scopeAll
            ? "No unions in this world."
            : `No unions for ${countryName}. The engine seeds one union per represented sector.`}
        </Empty>
      </Section>
    );
  }
  return (
    <Section title={`Unions (${rows.length})`}>
      <Table
        headers={[
          "Union",
          "Country",
          "Sector",
          "Treasury",
          "Approval",
          "Dues/worker/yr",
          "Density",
          "Services",
          "Standing",
        ]}
        rows={rows.map((u) => [
          u.name,
          world.countries[u.countryId]?.name ?? u.countryId,
          u.sectorType,
          fmtMoney(u.treasury),
          fmtFloat(u.approval),
          fmtMoney(u.duesPerWorkerAnnual),
          fmtFloat(u.unionization),
          u.activeServices.length === 0 ? "none" : u.activeServices.join(", "),
          u.suspended === true ? "suspended (banned)" : (u.ownerType ?? "vacant-led"),
        ])}
      />
    </Section>
  );
}

function CommandSection({ world, countryId }: { world: WorldState; countryId: string }) {
  const state = world.commandEconomy[countryId];
  const budget = world.budgets[countryId];
  const countryName = world.countries[countryId]?.name ?? countryId;
  if (state === undefined) {
    return (
      <Section title="Command-economy state">
        <Empty>
          No command-economy state for {countryName}. The engine seeds one per planned
          economy only; market economies carry no marketization or shortage readings.
        </Empty>
      </Section>
    );
  }
  return (
    <>
      <Section title="Command-economy readings">
        <KeyValues
          entries={[
            ["Marketization level", `${fmtFloat(state.marketizationLevel)} / 100`],
            ["Monetary overhang", fmtFloat(state.monetaryOverhang)],
            ["Shortage index", fmtFloat(state.shortageIndex)],
            ["Black-market premium", fmtPct(state.blackMarketPremium)],
            ["Second-economy share", fmtPct(state.secondEconomyShare)],
            ["Black-market pressure (base)", fmtFloat(state.blackMarketPressureBase)],
            ["Black-market pressure (effective)", fmtFloat(state.blackMarketPressureEffective)],
            ["Government reformism", fmtFloat(state.governmentReformism, 2)],
            ["Internal repression", fmtFloat(state.internalRepression, 2)],
            ["Budget softness", fmtFloat(state.budgetSoftness, 2)],
            [
              "State ownership concentration",
              budget === undefined ? "—" : fmtFloat(budget.stateOwnershipConcentration),
            ],
            [
              "Investor confidence",
              budget?.investorConfidence === undefined
                ? "—"
                : fmtFloat(budget.investorConfidence),
            ],
          ]}
        />
      </Section>
    </>
  );
}

function MetricsSection({ world, countryId }: { world: WorldState; countryId: string }) {
  const metrics = world.nationalMetrics[countryId];
  const model = world.economicModels[countryId];
  const countryName = world.countries[countryId]?.name ?? countryId;
  const entries = useMemo(
    () => (metrics === undefined ? [] : Object.entries(metrics).sort(([a], [b]) => a.localeCompare(b))),
    [metrics],
  );
  const scores = useMemo(
    () =>
      model === undefined
        ? []
        : (Object.entries(model.scores) as Array<[string, number]>).sort(([, a], [, b]) => b - a),
    [model],
  );
  if (entries.length === 0 && model === undefined) {
    return (
      <Section title="Metric records">
        <Empty>No national metrics or economic-model state for {countryName}.</Empty>
      </Section>
    );
  }
  return (
    <>
      <Section title={`National metrics (${entries.length})`}>
        {entries.length === 0 ? (
          <Empty>No metric-family readings for {countryName}.</Empty>
        ) : (
          <Table
            headers={["Metric", "Value"]}
            rows={entries.map(([key, metric]) => [key, fmtFloat(metric.value, 2)])}
          />
        )}
      </Section>
      <Section title="Economic model">
        {model === undefined ? (
          <Empty>No economic-model identity for {countryName}.</Empty>
        ) : (
          <>
            <KeyValues
              entries={[
                ["Current model", model.current],
                ["Intensity", fmtFloat(model.intensity, 2)],
                [
                  "Challenger",
                  model.challenger === undefined
                    ? "none"
                    : `${model.challenger.modelId} (${model.challenger.turnsLeading} turns leading)`,
                ],
                ["Last updated", model.lastUpdated],
              ]}
            />
            <Table
              headers={["Model", "Score"]}
              rows={scores.map(([id, score]) => [id, fmtFloat(score, 2)])}
            />
          </>
        )}
      </Section>
    </>
  );
}

function conflictsInvolving(world: WorldState, countryId: string) {
  return world.conflicts
    .filter((c) => c.sideA.countries.includes(countryId) || c.sideB.countries.includes(countryId))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function conflictRow(c: WorldState["conflicts"][number]): string[] {
  return [
    c.id,
    c.type,
    c.status,
    c.sideA.countries.join(", "),
    c.sideB.countries.join(", "),
    String(c.intensity),
    c.control === undefined ? "—" : fmtFloat(c.control),
    c.poleSide === undefined
      ? "—"
      : `side ${c.poleSide}${c.poleSinceTurn === undefined ? "" : ` since turn ${c.poleSinceTurn}`}`,
    c.termsWindowClosesTurn === undefined ? "—" : `turn ${c.termsWindowClosesTurn}`,
    c.outcome === undefined ? "—" : c.outcome.winner,
  ];
}

const CONFLICT_HEADERS = [
  "Conflict",
  "Type",
  "Status",
  "Side A",
  "Side B",
  "Intensity",
  "Control (B%)",
  "Pole",
  "Terms window",
  "Outcome",
];

function ConflictsSection({ world, countryId }: { world: WorldState; countryId: string }) {
  const involving = useMemo(() => conflictsInvolving(world, countryId), [world, countryId]);
  const others = useMemo(
    () =>
      world.conflicts
        .filter(
          (c) => !c.sideA.countries.includes(countryId) && !c.sideB.countries.includes(countryId),
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
    [world, countryId],
  );
  const countryName = world.countries[countryId]?.name ?? countryId;
  const involvingIds = useMemo(() => new Set(involving.map((c) => c.id)), [involving]);
  const settlements = useMemo(
    () =>
      world.settlements
        .filter((s) => involvingIds.has(s.conflictId))
        .sort((a, b) => a.turn - b.turn),
    [world, involvingIds],
  );
  const tension = world.coldWarTension;
  const nuclear = world.nuclearPrograms[countryId];
  const alignment = world.alignments[countryId];
  const recentEvents = useMemo(() => tension.events.slice(-5).reverse(), [tension]);
  return (
    <>
      <Section title={`Conflicts involving ${countryName} (${involving.length})`}>
        {involving.length === 0 ? (
          <Empty>{countryName} is a belligerent in no tracked conflict.</Empty>
        ) : (
          <Table headers={CONFLICT_HEADERS} rows={involving.map(conflictRow)} />
        )}
      </Section>
      <Section title={`Other conflicts (${others.length})`}>
        {others.length === 0 ? (
          <Empty>No other tracked conflicts in this world.</Empty>
        ) : (
          <Table headers={CONFLICT_HEADERS} rows={others.map(conflictRow)} />
        )}
      </Section>
      <Section title={`Settlements (${settlements.length})`}>
        {settlements.length === 0 ? (
          <Empty>No settlements on {countryName} conflicts.</Empty>
        ) : (
          <Table
            headers={["Settlement", "Conflict", "Turn", "Path", "Winner", "Truce until"]}
            rows={settlements.map((s) => [
              s.id,
              s.conflictId,
              String(s.turn),
              s.path,
              s.winner,
              `turn ${s.truceUntilTurn}`,
            ])}
          />
        )}
      </Section>
      <Section title="Cold-war tension">
        <KeyValues
          entries={[
            ["Tension", fmtFloat(tension.value)],
            ["Pressure floor", fmtFloat(tension.pressureFloor)],
            ["Updated turn", String(tension.updatedTurn)],
          ]}
        />
        {recentEvents.length === 0 ? (
          <Empty>No tension events recorded.</Empty>
        ) : (
          <Table
            headers={["Turn", "Kind", "Label", "Delta"]}
            rows={recentEvents.map((e) => [
              String(e.turn),
              e.kind,
              e.label,
              fmtFloat(e.delta),
            ])}
          />
        )}
      </Section>
      <Section title="Nuclear program">
        {nuclear === undefined ? (
          <Empty>No nuclear program for {countryName} in this world.</Empty>
        ) : (
          <KeyValues
            entries={[
              ["Warheads", fmtInt(nuclear.warheads)],
              ["Production rate", fmtInt(nuclear.productionRate)],
              [
                "Adopted nodes",
                Object.keys(nuclear.adopted).length === 0
                  ? "none"
                  : Object.entries(nuclear.adopted)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([node, turn]) => `${node} (turn ${turn})`)
                      .join("; "),
              ],
            ]}
          />
        )}
      </Section>
      <Section title="Bloc alignment">
        {alignment === undefined ? (
          <Empty>No alignment record for {countryName}.</Empty>
        ) : (
          <KeyValues
            entries={[
              [
                "Shares",
                Object.keys(alignment.shares).length === 0
                  ? "none"
                  : (Object.entries(alignment.shares) as Array<[string, number]>)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([pole, share]) => `${pole} ${fmtFloat(share)}`)
                      .join("; "),
              ],
              ["Non-aligned", fmtFloat(alignment.nonAligned)],
              ["Updated turn", String(alignment.updatedTurn)],
            ]}
          />
        )}
      </Section>
    </>
  );
}

function ForcesSection({ world, countryId }: { world: WorldState; countryId: string }) {
  const involving = useMemo(() => conflictsInvolving(world, countryId), [world, countryId]);
  const nuclear = world.nuclearPrograms[countryId];
  const countryName = world.countries[countryId]?.name ?? countryId;
  return (
    <>
      <Section title="Engine coverage">
        <p className="cd-note">
          The engine carries no naval or air unit rosters (unit-level combat is an explicit
          engine gap), so there is no ship or squadron list to show. What the engine does
          model for {countryName} is below: its conflicts and its nuclear program.
        </p>
      </Section>
      <Section title={`Conflicts involving ${countryName} (${involving.length})`}>
        {involving.length === 0 ? (
          <Empty>{countryName} is a belligerent in no tracked conflict.</Empty>
        ) : (
          <Table headers={CONFLICT_HEADERS} rows={involving.map(conflictRow)} />
        )}
      </Section>
      <Section title="Nuclear program">
        {nuclear === undefined ? (
          <Empty>No nuclear program for {countryName} in this world.</Empty>
        ) : (
          <KeyValues
            entries={[
              ["Warheads", fmtInt(nuclear.warheads)],
              ["Production rate", fmtInt(nuclear.productionRate)],
              [
                "Adopted nodes",
                Object.keys(nuclear.adopted).length === 0
                  ? "none"
                  : Object.entries(nuclear.adopted)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([node, turn]) => `${node} (turn ${turn})`)
                      .join("; "),
              ],
            ]}
          />
        )}
      </Section>
    </>
  );
}
