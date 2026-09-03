import type { CountryOverviewModel, MissingRecord } from "./model.js";
import "./country-overview.css";

export interface CountryOverviewScreenProps {
  model: CountryOverviewModel;
  onNavigate: (routeId: string) => void;
  onAdvance: () => void;
  onQuickSave: () => void;
  busy?: boolean;
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCurrency(value: number): string {
  return value < 0
    ? `-$${formatMoney(Math.abs(value))}`
    : `$${formatMoney(value)}`;
}

/** An explicit engine gap. Always visible, never omitted. */
function ParityError({ record }: { record: MissingRecord }) {
  return (
    <div
      className="cov-parity-error"
      role="alert"
      data-testid={`cov-parity-${record.category}`}
    >
      <strong>Unavailable: {record.category}</strong>
      <span className="cov-parity-detail">{record.detail}</span>
      <span className="cov-parity-gap">Engine gap: {record.engineGap}</span>
    </div>
  );
}

function missingOf(
  model: CountryOverviewModel,
  category: string,
): MissingRecord | undefined {
  return model.unavailable.find((record) => record.category === category);
}

interface DirectoryRow {
  id: string;
  label: string;
  detail: string;
  figure: string;
  gate?: string | undefined;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Budget surplus as a signed share of GDP ("+1.2% GDP"), null when the
 * country carries no usable budget figure.
 */
function budgetBalanceFigure(pct: number | null): string | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  const rounded = Math.abs(pct) < 0.05 ? 0 : pct;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}% GDP`;
}

/**
 * AHDGame country-overview Explore directory: groups Politics,
 * Government, Economy, Nation in that order. Every row is always present
 * as a button: conditional destinations (live race, referendums, SCOTUS,
 * command economy, forces, Cold War) keep their rule as a gate note
 * instead of being silently omitted. Route ids reuse the navigation
 * manifest and CountryDetails routes verbatim, except
 * `nation.economy.nationalization`, an overview-stable id with no details
 * screen yet.
 */
function directoryFor(model: CountryOverviewModel): Array<{
  group: string;
  rows: DirectoryRow[];
}> {
  const livePresidential = model.elections.items.find((election) =>
    /president/i.test(election.electionType),
  );
  const head = model.leaders[0];
  const counts = model.counts;
  const isPresidential = /presidential/i.test(model.country.governmentType);
  const isUS = model.country.id === "US";
  const electionsFigure =
    counts.activeElections > 0
      ? `${counts.activeElections} live`
      : counts.upcomingElections > 0
        ? `${counts.upcomingElections} upcoming`
        : "None scheduled";
  const referendumsFigure =
    counts.activeReferendums > 0
      ? `${counts.activeReferendums} live`
      : counts.totalReferendums > 0
        ? `${counts.totalReferendums} past`
        : "None recorded";
  const coldWarGate =
    counts.coldWarPrincipal && counts.coldWarListed
      ? undefined
      : "Cold War principals (US, RU) while the subsystem runs";
  return [
    {
      group: "Politics",
      rows: [
        {
          id: "nation.politics.presidential-election",
          label: "Presidential Election",
          detail: "Quick link to the live race page",
          figure: livePresidential
            ? `${livePresidential.electionType}: ${livePresidential.status}`
            : "No live race",
          gate: livePresidential
            ? undefined
            : "Direct-election countries with an active race",
        },
        {
          id: "nation.politics.elections",
          label: "Elections",
          detail: "Active and upcoming contests",
          figure: electionsFigure,
        },
        {
          id: "nation.politics.parties",
          label: "Political Parties",
          detail: "Organization, leadership, and membership",
          figure: `${counts.parties} active`,
        },
        {
          id: "nation.politics.politicians",
          label: "Politicians",
          detail: "Country politician roster",
          figure: `${counts.politicians} politicians`,
        },
        {
          id: "nation.politics.approval",
          label: "Approval",
          detail: "National approval of the government",
          figure:
            model.approval !== null
              ? `${Math.round(model.approval.value)}%`
              : "No local record",
          gate:
            model.approval !== null
              ? undefined
              : "No approval record for this country",
        },
        {
          id: "nation.politics.referendums",
          label: "Referendums",
          detail: "Independence and reunification referendums",
          figure: referendumsFigure,
          gate:
            counts.totalReferendums > 0
              ? undefined
              : "Countries with referendum history",
        },
      ],
    },
    {
      group: "Government",
      rows: [
        {
          id: "nation.government.legislature",
          label: model.legislature.name,
          detail: "National legislature",
          figure:
            counts.activeBills > 0
              ? pluralize(counts.activeBills, "bill")
              : "No active bills",
        },
        {
          id: "nation.government.executive",
          label: isPresidential ? "White House" : "Executive",
          detail: head?.office ?? "No executive offices",
          figure: head?.name ?? "Vacant",
        },
        {
          id: "nation.economy.budget",
          label: "National Budget",
          detail: "Revenue, spending, and debt",
          figure:
            model.budget === null
              ? "No budget"
              : (budgetBalanceFigure(counts.budgetBalancePctGdp) ??
                model.budget.creditRating),
          gate:
            model.budget === null
              ? "No national budget in this world"
              : undefined,
        },
        {
          id: "nation.government.policy",
          label: "Policy",
          detail: "Enacted national laws",
          figure: pluralize(counts.enactedLaws, "law"),
        },
        {
          id: "nation.government.scotus",
          label: "Supreme Court",
          detail: "Court seats, nominations, and docket",
          figure:
            counts.scotusSeats > 0
              ? pluralize(counts.scotusSeats, "seat")
              : "No local record",
          gate: isUS ? undefined : "US only",
        },
      ],
    },
    {
      group: "Economy",
      rows: [
        {
          id: "nation.economy.economy",
          label: "Economy",
          detail: "Output, prices, and employment",
          figure: formatPct(model.economy.growthRate),
        },
        {
          id: "world.stock-market",
          label: "Stock Market",
          detail: "Exchange-listed domestic corporations",
          figure:
            counts.stockListings > 0
              ? pluralize(counts.stockListings, "listing")
              : "No listings",
        },
        {
          id: "nation.economy.banking",
          label: "Central Bank",
          detail: "Policy rate and chartered banks",
          figure:
            counts.primeRate !== null
              ? `${counts.primeRate.toFixed(2)}%`
              : "No central bank",
          gate:
            counts.primeRate !== null
              ? undefined
              : "Countries with a central bank",
        },
        {
          id: "world.forex",
          label: "Foreign Exchange",
          detail: "Exchange rate against the anchor currency",
          figure:
            counts.forexRate !== null
              ? `${counts.forexRate} per anchor`
              : "No local record",
          gate:
            counts.forexRate !== null ? undefined : "Forex-active countries",
        },
        {
          id: "nation.economy.unions",
          label: "Unions",
          detail: "Country-scoped unions roster",
          figure:
            counts.unions > 0
              ? pluralize(counts.unions, "union")
              : "None chartered",
          gate: counts.unions > 0 ? undefined : "Unions feature",
        },
        {
          id: "nation.economy.nationalization",
          label: "Nationalization",
          detail: "Public takings and privatization auctions",
          figure: "No local record",
        },
        {
          id: "nation.economy.command",
          label: "Command Economy",
          detail: "Planning, marketization, and state ownership",
          figure: counts.commandEconomy ? "Active" : "Market economy",
          gate: counts.commandEconomy ? undefined : "Planned economies",
        },
      ],
    },
    {
      group: "Nation",
      rows: [
        {
          id: "nation.other.map",
          label: "Map",
          detail: model.country.regionLabel,
          figure: pluralize(counts.regions, "region"),
        },
        model.country.playable
          ? {
              id: "nation.politics.political-metrics",
              label: "Political Metrics",
              detail: "Political registry",
              figure: "View metrics",
            }
          : {
              id: "nation.economy.metrics",
              label: "National Metrics",
              detail: "Legacy metrics page",
              figure: "View metrics",
            },
        {
          id: "help.wiki",
          label: "Wiki",
          detail: "Game guides and how-tos",
          figure: "Open wiki",
        },
        {
          id: "nation.defense.forces",
          label: "Naval and Air Command",
          detail: "Fleet and air wings",
          figure: "No rosters",
          gate: "No fleet or air wing rosters in the engine",
        },
        {
          id: "world.conflicts",
          label: "Cold War",
          detail: "Cold-war tension and settlements",
          figure:
            counts.activeConflicts > 0
              ? pluralize(counts.activeConflicts, "active conflict")
              : "No active conflicts",
          gate: coldWarGate,
        },
      ],
    },
  ];
}

function toneForGrowth(rate: number): string {
  if (rate >= 0.02) return "positive";
  if (rate >= 0) return "warning";
  return "negative";
}

function toneForRate(value: number, goodBelow: number, warningBelow: number): string {
  if (value <= goodBelow) return "positive";
  if (value <= warningBelow) return "warning";
  return "negative";
}

/**
 * Production Variant A country overview: mainline multiplayer hierarchy
 * (hero, leadership, approval, government type, Explore directory,
 * descriptor, national ideology, economic model, regime, sovereign debt,
 * economy, legislature) rendered from a transport-free
 * CountryOverviewModel. No WorldState, fetch, Tauri, or prototype imports.
 */
export function CountryOverviewScreen({
  model,
  onNavigate,
  onAdvance,
  onQuickSave,
  busy = false,
}: CountryOverviewScreenProps) {
  const groups = directoryFor(model);
  const government = model.government;
  const chamberSeats = (chamber: (typeof model.legislature.chambers)[number]) =>
    Math.max(1, chamber.seats - chamber.vacancies);

  return (
    <div className="cov-root">
      <header className="cov-hero" data-testid="cov-hero">
        <div className="cov-hero-top">
          <span className="cov-region">{model.country.regionLabel}</span>
          <span
            className="cov-live"
            data-tone={model.registration.tone}
          >
            {model.registration.label}
          </span>
        </div>
        <h1 className="cov-title">{model.country.name}</h1>
        <p className="cov-worldline">
          {model.world.era} / {model.world.date} / Turn {model.world.turn} /
          Seed {model.world.seed}
        </p>
        <p className="cov-playerline">
          {model.player.name} / {model.player.party} /{" "}
          {model.player.actions} actions / {formatCompact(model.player.funds)}{" "}
          funds
        </p>
        <div className="cov-hero-actions">
          <button
            type="button"
            className="cov-primary"
            onClick={onAdvance}
            disabled={busy}
          >
            {busy ? "Processing turn" : "End turn"}
          </button>
          <button
            type="button"
            className="cov-secondary"
            onClick={onQuickSave}
            disabled={busy}
          >
            Quick save
          </button>
        </div>
        <dl className="cov-vitals">
          {model.leaders.slice(0, 3).map((leader) => (
            <div key={leader.office}>
              <dt>{leader.office}</dt>
              <dd>{leader.name ?? "Vacant"}</dd>
            </div>
          ))}
          <div>
            <dt>Government type</dt>
            <dd>{model.country.governmentType}</dd>
          </div>
          <div>
            <dt>World date</dt>
            <dd>{model.world.date}</dd>
          </div>
        </dl>
      </header>

      <section aria-label="Leadership" data-testid="cov-leadership">
        <h2 className="cov-kicker">Leadership</h2>
        <ul className="cov-leaders">
          {model.leaders.map((leader) => (
            <li key={leader.office} data-testid="cov-leader">
              <strong>{leader.office}</strong>
              <span>{leader.name ?? "Vacant"}</span>
              <small>{leader.party ?? "Office unfilled"}</small>
            </li>
          ))}
        </ul>
        {model.chamberOfficers.length > 0 && (
          <div data-testid="cov-officers">
            {model.chamberOfficers.map((officers) => (
              <p key={officers.chamberKey} data-testid="cov-officer">
                <strong>{officers.chamberName}</strong>
                {" — Speaker: "}
                {officers.speakerName ?? "Vacant"}
                {officers.speakerParty ? ` (${officers.speakerParty})` : ""}
                {"; Majority leader: "}
                {officers.majorityLeaderName ?? "Vacant"}
                {officers.majorityLeaderParty
                  ? ` (${officers.majorityLeaderParty})`
                  : ""}
              </p>
            ))}
          </div>
        )}
        {missingOf(model, "chamberLeadership") && (
          <ParityError record={missingOf(model, "chamberLeadership")!} />
        )}
      </section>

      <section aria-label="Approval" data-testid="cov-approval">
        <h2 className="cov-kicker">Approval</h2>
        {model.approval ? (
          <div>
            <p className="cov-approval-value" data-testid="cov-approval-value">
              {model.approval.value.toFixed(1)} / 100
            </p>
            <p
              className="cov-approval-history"
              data-testid="cov-approval-history"
            >
              {model.approval.history.length}{" "}
              {model.approval.history.length === 1 ? "sample" : "samples"}, turn{" "}
              {model.approval.history[0]?.turn ?? model.approval.updatedTurn}–
              {model.approval.updatedTurn}
            </p>
          </div>
        ) : missingOf(model, "nationalApproval") ? (
          <ParityError record={missingOf(model, "nationalApproval")!} />
        ) : (
          <p className="cov-empty">
            No national approval metric in this world.
          </p>
        )}
      </section>

      <section aria-label="Government type" data-testid="cov-government-type">
        <h2 className="cov-kicker">Government type</h2>
        <p className="cov-government-label">{model.country.governmentType}</p>
        {government === null ? (
          <p className="cov-empty">
            No parliamentary government seated: presidential systems form
            none.
          </p>
        ) : (
          <dl className="cov-facts">
            <div>
              <dt>Status</dt>
              <dd>{government.status}</dd>
            </div>
            <div>
              <dt>Head</dt>
              <dd>{government.headName ?? "Vacant"}</dd>
            </div>
            <div>
              <dt>Supporting seats</dt>
              <dd>
                {government.totalSeatsSupporting} /{" "}
                {government.majorityThreshold}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section aria-label="Explore" data-testid="cov-explore">
        <h2 className="cov-kicker">Explore {model.country.name}</h2>
        <div className="cov-directory">
          {groups.map((group) => (
            <section key={group.group} aria-label={group.group}>
              <h3>{group.group}</h3>
              <div>
                {group.rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="cov-directory-row"
                    data-testid="cov-dir-row"
                    data-route={row.id}
                    onClick={() => onNavigate(row.id)}
                    aria-label={row.gate ? `${row.label} (${row.gate})` : row.label}
                  >
                    <span className="cov-row-text">
                      <strong>{row.label}</strong>
                      <small>{row.detail}</small>
                      {row.gate && (
                        <small className="cov-gate">{row.gate}</small>
                      )}
                    </span>
                    <b>{row.figure}</b>
                    <i aria-hidden="true">&#8250;</i>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <p className="cov-descriptor" data-testid="cov-descriptor">
        {model.country.descriptor}
      </p>

      <section aria-label="National ideology" data-testid="cov-national-ideology">
        <h2 className="cov-kicker">National ideology</h2>
        <p className="cov-ideology-note">
          Derived from enacted law provisions, not party seats:{" "}
          {model.nationalAxes.enactedLawCount} laws,{" "}
          {model.nationalAxes.provisionCount} provisions,{" "}
          {model.nationalAxes.unresolvableLawCount} unresolvable.
        </p>
        <div className="cov-axes">
          <label>
            Economic <span>Left</span>
            <b>
              <i
                style={{
                  left: `${((model.nationalAxes.economic + 5) / 10) * 100}%`,
                }}
              />
            </b>
            <span>Right</span>
            <strong data-testid="cov-axis-economic">
              {model.nationalAxes.economic}
            </strong>
          </label>
          <label>
            Social <span>Libertarian</span>
            <b>
              <i
                style={{
                  left: `${((model.nationalAxes.social + 5) / 10) * 100}%`,
                }}
              />
            </b>
            <span>Authoritarian</span>
            <strong data-testid="cov-axis-social">
              {model.nationalAxes.social}
            </strong>
          </label>
        </div>
      </section>

      <section aria-label="Economic model" data-testid="cov-economic-model">
        <h2 className="cov-kicker">Economic model</h2>
        {model.economicModel ? (
          <p className="cov-model-name" data-testid="cov-economic-model-name">
            {model.economicModel.name} ({model.economicModel.intensity})
          </p>
        ) : (
          <p className="cov-empty">
            No economic-model classification yet: it is computed on the
            first turn.
          </p>
        )}
        <dl className="cov-facts">
          <div>
            <dt>Growth</dt>
            <dd>{formatPct(model.economy.growthRate)}</dd>
          </div>
          <div>
            <dt>Inflation</dt>
            <dd>{formatPct(model.economy.inflationRate)}</dd>
          </div>
          <div>
            <dt>Unemployment</dt>
            <dd>{formatPct(model.economy.unemploymentRate)}</dd>
          </div>
          <div>
            <dt>Output gap</dt>
            <dd>
              {model.economy.outputGap > 0 ? "+" : ""}
              {model.economy.outputGap.toFixed(1)}%
            </dd>
          </div>
        </dl>
      </section>

      <section aria-label="Regime" data-testid="cov-regime">
        <h2 className="cov-kicker">Regime</h2>
        {model.regime ? (
          <div>
            <p className="cov-regime-label" data-testid="cov-regime-label">
              {model.regime.label}
            </p>
            <dl className="cov-facts">
              <div>
                <dt>Legitimacy</dt>
                <dd data-testid="cov-legitimacy">
                  {model.legitimacy?.toFixed(1) ?? "Unknown"}
                </dd>
              </div>
              <div>
                <dt>Unrest</dt>
                <dd data-testid="cov-unrest">
                  {model.unrest?.toFixed(1) ?? "Unknown"}
                </dd>
              </div>
            </dl>
          </div>
        ) : missingOf(model, "regime") ? (
          <ParityError record={missingOf(model, "regime")!} />
        ) : (
          <p className="cov-empty">No regime classification in this world.</p>
        )}
      </section>

      <section aria-label="Sovereign debt" data-testid="cov-sovereign-debt">
        <h2 className="cov-kicker">Sovereign debt</h2>
        {model.sovereignDebt ? (
          <dl className="cov-facts">
            <div>
              <dt>Debt principal</dt>
              <dd data-testid="cov-debt">
                {formatCurrency(model.sovereignDebt.debtPrincipal)}
              </dd>
            </div>
            <div>
              <dt>Debt ceiling</dt>
              <dd data-testid="cov-debt-ceiling">
                {formatCurrency(model.sovereignDebt.debtCeiling)}
                {model.sovereignDebt.debtToCeiling !== null &&
                  ` (${(model.sovereignDebt.debtToCeiling * 100).toFixed(1)}% of ceiling)`}
              </dd>
            </div>
            <div>
              <dt>Credit rating</dt>
              <dd>{model.sovereignDebt.creditRating}</dd>
            </div>
            <div>
              <dt>Revenue</dt>
              <dd>{formatCurrency(model.sovereignDebt.revenueTotal)}</dd>
            </div>
            <div>
              <dt>Spending</dt>
              <dd>{formatCurrency(model.sovereignDebt.spendingTotal)}</dd>
            </div>
            <div>
              <dt>Surplus</dt>
              <dd>{formatCurrency(model.sovereignDebt.surplus)}</dd>
            </div>
            <div>
              <dt>Debt interest</dt>
              <dd>
                {formatCurrency(model.sovereignDebt.debtInterest)} @{" "}
                {(model.sovereignDebt.interestRate * 100).toFixed(2)}%
              </dd>
            </div>
            <div>
              <dt>Sovereign bonds</dt>
              <dd data-testid="cov-bonds">
                {model.sovereignDebt.outstandingBondCount} outstanding
                {model.sovereignDebt.defaultedBondCount > 0 &&
                  `, ${model.sovereignDebt.defaultedBondCount} defaulted`}
              </dd>
            </div>
            {model.sovereignDebt.debtCeilingCrisisActive && (
              <div>
                <dt>Debt ceiling crisis</dt>
                <dd data-testid="cov-debt-crisis">Active</dd>
              </div>
            )}
            {model.sovereignDebt.activeCrisisNames.length > 0 && (
              <div>
                <dt>Active crises</dt>
                <dd>{model.sovereignDebt.activeCrisisNames.join(", ")}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="cov-empty" data-testid="cov-no-budget">
            No national budget in this world. Debt, revenue, and rating are
            unknown, not zero.
          </p>
        )}
      </section>

      <section aria-label="Economy" data-testid="cov-economy">
        <div className="cov-section-head">
          <div>
            <span className="cov-kicker">National economy</span>
            <h2>Vital signs</h2>
          </div>
          <span>Updated turn {model.world.turn}</span>
        </div>
        <div className="cov-stat-grid">
          <article data-tone="neutral">
            <small>GDP</small>
            <strong>${formatMoney(model.economy.gdp)}M</strong>
            <span>Nominal output</span>
          </article>
          <article data-tone={toneForGrowth(model.economy.growthRate)}>
            <small>Growth</small>
            <strong>{formatPct(model.economy.growthRate)}</strong>
            <span>Annualized</span>
          </article>
          <article
            data-tone={toneForRate(model.economy.inflationRate, 0.03, 0.07)}
          >
            <small>Inflation</small>
            <strong>{formatPct(model.economy.inflationRate)}</strong>
            <span>Annualized</span>
          </article>
          <article
            data-tone={toneForRate(model.economy.unemploymentRate, 0.05, 0.09)}
          >
            <small>Unemployment</small>
            <strong>{formatPct(model.economy.unemploymentRate)}</strong>
            <span>Labor force</span>
          </article>
          <article
            data-tone={
              Math.abs(model.economy.outputGap) < 2 ? "positive" : "warning"
            }
          >
            <small>Output gap</small>
            <strong>
              {model.economy.outputGap > 0 ? "+" : ""}
              {model.economy.outputGap.toFixed(1)}%
            </strong>
            <span>Potential output</span>
          </article>
        </div>
        <p className="cov-corps">
          {model.counts.corporations} domestic corporations
          {model.corporations.length > 0 &&
            ` (${model.corporations
              .slice(0, 4)
              .map((c) => `${c.id} ${c.sector}`)
              .join(", ")}${
              model.corporations.length > 4 ? ", more" : ""
            })`}
        </p>
      </section>

      <section aria-label="Legislature" data-testid="cov-legislature">
        <div className="cov-section-head">
          <div>
            <span className="cov-kicker">National legislature</span>
            <h2>{model.legislature.name}</h2>
          </div>
          <span>
            {model.legislature.totalSeats} seats /{" "}
            {model.legislature.totalVacancies} vacant
          </span>
        </div>
        {model.legislature.chambers.map((chamber) => (
          <article key={chamber.key} className="cov-chamber">
            <h3>
              {chamber.name}{" "}
              <small>{chamber.elected ? "Elected" : "Appointed"}</small>
            </h3>
            <div className="cov-seatbar" aria-hidden="true">
              {chamber.parties.map((party) => (
                <span
                  key={party.id}
                  style={{
                    width: `${(party.seats / chamberSeats(chamber)) * 100}%`,
                    backgroundColor: party.color,
                  }}
                  title={`${party.name}: ${party.seats}`}
                />
              ))}
            </div>
            <ul className="cov-party-list">
              {chamber.parties.slice(0, 6).map((party) => (
                <li key={party.id}>
                  <i style={{ backgroundColor: party.color }} />
                  <span>
                    <strong>{party.abbreviation}</strong>
                    <small>{party.name}</small>
                  </span>
                  <b>{party.seats}</b>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}
