import type { WorldState } from "@ahdclient/engine";
import type {
  CountryOverviewModel,
  MissingRecord,
  NationalAxes,
  OverviewChamber,
  OverviewChamberOfficer,
  OverviewEconomicModel,
  OverviewGovernment,
  OverviewLeader,
  OverviewPartySeat,
  OverviewSovereignDebt,
} from "./model.js";
import type { CountryOverviewSource } from "./source.js";

const AXIS_MIN = -5;
const AXIS_MAX = 5;

const TERMINAL_BILL_STATUSES = new Set([
  "signed",
  "failed",
  "withdrawn",
  "override_failed",
]);

/** Referendum lifecycle stages with a live campaign (see referendum/types.ts). */
const LIVE_REFERENDUM_STATUSES = new Set([
  "campaigning",
  "polling",
  "actuating",
]);

/** Cold War principals, mirroring AHDGame COLD_WAR_PRINCIPAL_IDS. */
const COLD_WAR_PRINCIPALS = new Set(["US", "RU"]);

/**
 * Display labels for engine RegimeClassification values. Mirrors the
 * engine derivation (countryPolitics/overview.ts classifyRegime); kept
 * local because the engine exports no label map.
 */
const REGIME_LABELS: Record<string, string> = {
  "presidential-republic": "Presidential republic",
  parliamentary: "Parliamentary",
  "one-party": "One-party state",
  "national-government": "National government",
};

/**
 * Display names for engine EconomicModelId values. Mirrors
 * metrics/economicModel.ts MODEL_ARCHETYPES names; kept local because the
 * engine exports no archetype map through its index.
 */
const ECONOMIC_MODEL_NAMES: Record<string, string> = {
  militaryIndustrial: "Military-Industrial Complex",
  techInnovation: "Tech Innovation",
  financialized: "Financialized",
  industrialPowerhouse: "Industrial Powerhouse",
  resourceExtraction: "Resource Extraction",
  agrarian: "Agrarian",
  serviceConsumer: "Service Consumer",
  socialMarket: "Social Market",
  stateCapitalist: "State Capitalist",
  mixed: "Mixed",
};

function clampAxis(value: number): number {
  return Math.min(AXIS_MAX, Math.max(AXIS_MIN, value));
}

/**
 * Gaps that remain only when no countryPolitics record is seeded
 * (non-playable countries). Playable countries back approval, regime,
 * and chamber officers from live engine state, so no gap is listed.
 * Ceremonial head of state is never listed: the engine models the
 * executive only and no separate ceremonial office applies. Parliamentary
 * formation is never listed either: presidential systems have no
 * formation to report (see governmentFor), and seated governments render
 * directly.
 */
function engineGaps(politicsSeeded: boolean): MissingRecord[] {
  if (politicsSeeded) return [];
  return [
    {
      category: "nationalApproval",
      detail: "National approval / popular support for the government",
      engineGap:
        "No countryPolitics record is seeded for this country (non-playable)",
    },
    {
      category: "chamberLeadership",
      detail: "Chamber leadership offices (speaker, majority leader)",
      engineGap:
        "No countryPolitics record is seeded for this country (non-playable)",
    },
    {
      category: "regime",
      detail: "Regime classification and legitimacy/unrest gauges",
      engineGap:
        "No countryPolitics record is seeded for this country (non-playable)",
    },
  ];
}

function politicianName(world: WorldState, id: string | null): string | null {
  if (id === null || id === "") return null;
  if (id === "player") return world.player.name;
  return world.politicians.find((p) => p.id === id)?.name ?? null;
}

function partyLabel(world: WorldState, id: string | null): string | null {
  if (id === null || id === "") return null;
  return world.parties[id]?.abbreviation ?? id;
}

function leadersFor(world: WorldState, countryId: string): OverviewLeader[] {
  const leaders: OverviewLeader[] = [];
  const executive = world.executives[countryId];
  if (executive !== undefined) {
    leaders.push({
      office: "President",
      name: politicianName(world, executive.presidentId),
      party: partyLabel(world, executive.presidentParty),
    });
    leaders.push({
      office: "Vice President",
      name: politicianName(world, executive.vicePresidentId),
      party: partyLabel(world, executive.vicePresidentParty),
    });
  }
  const government = world.governments[countryId];
  if (government !== undefined) {
    leaders.push({
      office: countryId === "UK" ? "Prime Minister" : "Head of Government",
      name: politicianName(world, government.pmPoliticianId),
      party: partyLabel(world, government.governingPartyId),
    });
  }
  if (leaders.length === 0) {
    leaders.push({ office: "Executive", name: null, party: null });
  }
  return leaders;
}

/**
 * Chamber officers from the countryPolitics record, resolved to live
 * roster names. A null holder is a vacant office (chamber seats nobody),
 * not a gap. Chambers with no officer entry report all offices vacant.
 */
function chamberOfficersFor(
  world: WorldState,
  countryId: string,
): OverviewChamberOfficer[] {
  const legislature = world.legislatures[countryId];
  if (legislature === undefined) return [];
  const officersByChamber =
    world.countryPolitics[countryId]?.officersByChamber ?? {};
  return legislature.chambers.map((chamber) => {
    const officers = officersByChamber[chamber.key];
    return {
      chamberKey: chamber.key,
      chamberName: chamber.name,
      speakerName: politicianName(world, officers?.speakerId ?? null),
      speakerParty: partyLabel(world, officers?.speakerPartyId ?? null),
      majorityLeaderName: politicianName(
        world,
        officers?.majorityLeaderId ?? null,
      ),
      majorityLeaderParty: partyLabel(
        world,
        officers?.majorityLeaderPartyId ?? null,
      ),
    };
  });
}

function legislatureFor(
  world: WorldState,
  countryId: string,
): CountryOverviewModel["legislature"] {
  const legislature = world.legislatures[countryId];
  const parties = Object.values(world.parties)
    .filter((party) => party.countryId === countryId)
    .sort((left, right) => left.name.localeCompare(right.name));
  const chambers: OverviewChamber[] = (legislature?.chambers ?? []).map(
    (chamber) => {
      const seats: OverviewPartySeat[] = parties
        .map((party) => ({
          id: party.id,
          name: party.name,
          abbreviation: party.abbreviation,
          color: party.color,
          seats: chamber.composition.seatsByParty[party.id] ?? 0,
          organization: party.organization,
          memberCount: party.memberCount,
        }))
        .filter((entry) => entry.seats > 0 || entry.organization > 0)
        .sort(
          (left, right) =>
            right.seats - left.seats || left.name.localeCompare(right.name),
        );
      return {
        key: chamber.key,
        name: chamber.name,
        elected: chamber.elected,
        seats: chamber.seats,
        vacancies: chamber.composition.vacancies,
        parties: seats,
      };
    },
  );
  return {
    name: legislature?.name ?? "No legislature",
    chambers,
    totalSeats: chambers.reduce((sum, chamber) => sum + chamber.seats, 0),
    totalVacancies: chambers.reduce(
      (sum, chamber) => sum + chamber.vacancies,
      0,
    ),
  };
}

/**
 * Parliamentary formation state, or null when the country seats none.
 * Null is "not applicable / not seated", never a gap: presidential
 * systems form no parliamentary government.
 */
function governmentFor(
  world: WorldState,
  countryId: string,
): OverviewGovernment | null {
  const government = world.governments[countryId];
  if (government === undefined) return null;
  return {
    status: government.status,
    formationType: government.formationType,
    governingPartyId: government.governingPartyId,
    coalitionPartyIds: government.coalitionPartyIds,
    headName: politicianName(world, government.pmPoliticianId),
    headParty: partyLabel(world, government.governingPartyId),
    totalSeatsSupporting: government.totalSeatsSupporting,
    majorityThreshold: government.majorityThreshold,
  };
}

/**
 * National axes, mainline semantics: equal-weight average over current
 * non-repealed national-scope enacted laws. Each law contributes its
 * enacting bill's raw provision economic/social values (effectDirection
 * is never applied); explicit zeros count, provisions missing an axis are
 * excluded from that axis, and each axis average is clamped to [-5, 5].
 * Laws whose bill is absent contribute nothing and are counted.
 */
function nationalAxesFor(world: WorldState, countryId: string): NationalAxes {
  const laws = world.enactedLaws.filter(
    (law) =>
      law.countryId === countryId &&
      law.scope === "national" &&
      law.repealedAtTurn === undefined &&
      (law.expiresAtTurn === undefined ||
        law.expiresAtTurn === null ||
        law.expiresAtTurn > world.meta.turn),
  );
  let economicSum = 0;
  let economicLaws = 0;
  let socialSum = 0;
  let socialLaws = 0;
  let provisionCount = 0;
  let unresolvableLawCount = 0;
  for (const law of laws) {
    const bill = world.bills.find((candidate) => candidate.id === law.billId);
    if (bill === undefined) {
      unresolvableLawCount += 1;
      continue;
    }
    const economicValues: number[] = [];
    const socialValues: number[] = [];
    for (const provision of bill.provisions) {
      if (
        typeof provision.economic !== "number" &&
        typeof provision.social !== "number"
      ) {
        continue;
      }
      provisionCount += 1;
      if (typeof provision.economic === "number") {
        economicValues.push(provision.economic);
      }
      if (typeof provision.social === "number") {
        socialValues.push(provision.social);
      }
    }
    // Equal weight per law: collapse a multi-provision bill to one value
    // per axis before averaging across laws.
    if (economicValues.length > 0) {
      economicSum +=
        economicValues.reduce((sum, value) => sum + value, 0) /
        economicValues.length;
      economicLaws += 1;
    }
    if (socialValues.length > 0) {
      socialSum +=
        socialValues.reduce((sum, value) => sum + value, 0) /
        socialValues.length;
      socialLaws += 1;
    }
  }
  return {
    economic: economicLaws > 0 ? clampAxis(economicSum / economicLaws) : 0,
    social: socialLaws > 0 ? clampAxis(socialSum / socialLaws) : 0,
    enactedLawCount: laws.length,
    provisionCount,
    unresolvableLawCount,
  };
}

/**
 * Engine-canonical government-type label. Prefers the countryPolitics
 * record; falls back to the same derivation for countries with none.
 */
function governmentTypeFor(world: WorldState, countryId: string): string {
  const seeded = world.countryPolitics[countryId]?.governmentType;
  if (typeof seeded === "string" && seeded.length > 0) return seeded;
  if (world.executives[countryId] !== undefined) return "Presidential republic";
  const government = world.governments[countryId];
  if (government !== undefined) {
    return government.formationType === "coalition"
      ? "Parliamentary coalition"
      : "Parliamentary government";
  }
  return "National government";
}

function economicModelFor(
  world: WorldState,
  countryId: string,
): OverviewEconomicModel | null {
  const record = world.economicModels[countryId];
  if (record === undefined) return null;
  return {
    id: record.current,
    name: ECONOMIC_MODEL_NAMES[record.current] ?? record.current,
    intensity: record.intensity,
  };
}

/**
 * Sovereign-debt view from the national budget plus the live sovereign
 * bond book and active crises. Null when the country carries no national
 * budget: without it principal, ceiling, and rating are unknown, not zero.
 */
function sovereignDebtFor(
  world: WorldState,
  countryId: string,
): OverviewSovereignDebt | null {
  const budget = world.budgets[countryId];
  if (budget === undefined) return null;
  let outstandingBondCount = 0;
  let outstandingBondFaceValue = 0;
  let maturedBondCount = 0;
  let defaultedBondCount = 0;
  for (const bond of Object.values(world.bonds ?? {})) {
    if (bond.countryId !== countryId || bond.issuerType !== "sovereign") {
      continue;
    }
    if (bond.defaulted) defaultedBondCount += 1;
    if (bond.matured) {
      maturedBondCount += 1;
      continue;
    }
    outstandingBondCount += 1;
    outstandingBondFaceValue +=
      bond.faceValue * Math.max(0, bond.totalIssued - bond.publicFloat);
  }
  const activeCrisisNames = (world.crises ?? [])
    .filter(
      (crisis) =>
        crisis.status === "active" && crisis.countryIds.includes(countryId),
    )
    .map((crisis) => crisis.name)
    .sort();
  return {
    revenueTotal: budget.revenue.total,
    spendingTotal: budget.spending.total,
    surplus: budget.surplus,
    debtPrincipal: budget.debt.principal,
    debtCeiling: budget.debt.ceiling,
    debtToCeiling:
      budget.debt.ceiling > 0
        ? budget.debt.principal / budget.debt.ceiling
        : null,
    interestRate: budget.debt.interestRate,
    debtInterest: budget.spending.debtInterest,
    creditRating: budget.creditRating,
    debtToGdpRatio: budget.debtToGdpRatio ?? null,
    outstandingBondCount,
    outstandingBondFaceValue,
    maturedBondCount,
    defaultedBondCount,
    debtCeilingCrisisActive:
      world.enactmentGates.debtCeilingCrisis[countryId]?.active === true,
    activeCrisisNames,
  };
}

/**
 * Local-engine reader: projects the live WorldState into the
 * transport-free overview. Read-only (builds new objects, never writes
 * the world), deterministic (no RNG, clock, fetch, Tauri, or React).
 */
export class LocalCountryOverviewSource implements CountryOverviewSource {
  private readonly world: WorldState;

  public constructor(world: WorldState) {
    this.world = world;
  }

  public async load(countryId: string): Promise<CountryOverviewModel> {
    const world = this.world;
    const country = world.countries[countryId];
    if (country === undefined) throw new Error(`Unknown country ${countryId}`);

    const parties = Object.values(world.parties).filter(
      (party) => party.countryId === countryId,
    );
    const politicians = world.politicians.filter(
      (politician) => politician.countryId === countryId,
    );
    const unresolvedElections = world.elections.filter(
      (election) =>
        election.countryId === countryId && election.status !== "resolved",
    );
    const activeElections = unresolvedElections.filter(
      (election) => election.status === "active",
    );
    const upcomingElections = unresolvedElections.filter(
      (election) => election.status === "upcoming",
    );
    const activeBills = world.bills.filter(
      (bill) =>
        bill.countryId === countryId &&
        !TERMINAL_BILL_STATUSES.has(bill.status),
    );
    const enactedLaws = world.enactedLaws.filter(
      (law) => law.countryId === countryId,
    );
    const corporations = Object.values(world.corporations)
      .filter((corporation) => corporation.countryId === countryId)
      .sort((left, right) => left.id.localeCompare(right.id));
    const budget = world.budgets[countryId];
    const referendums = world.referendums.filter(
      (referendum) => referendum.countryId === countryId,
    );
    const conflictsInvolving = world.conflicts.filter(
      (conflict) =>
        conflict.status !== "resolved" &&
        (conflict.sideA.countries.includes(countryId) ||
          conflict.sideB.countries.includes(countryId)),
    );
    const politics = world.countryPolitics[countryId] ?? null;
    const playerParty =
      world.player.partyId !== null
        ? (partyLabel(world, world.player.partyId) ?? "Independent")
        : "Independent";

    return {
      country: {
        id: country.id,
        name: country.name,
        descriptor: `${country.name}'s national institutions and economy.`,
        regionLabel:
          countryId === "US"
            ? "States and territories"
            : "National institutions",
        governmentType: governmentTypeFor(world, countryId),
        playable: country.playable,
      },
      world: {
        era: world.meta.era,
        date: world.meta.date,
        turn: world.meta.turn,
        seed: world.meta.seed,
      },
      registration: {
        label: "Local world",
        tone: country.playable ? "active" : "beta",
      },
      player: {
        name: world.player.name,
        actions: world.player.actions,
        cash: world.player.cash,
        funds: world.player.funds,
        party: playerParty,
      },
      leaders: leadersFor(world, countryId),
      chamberOfficers: chamberOfficersFor(world, countryId),
      approval:
        politics === null
          ? null
          : {
              value: politics.approval,
              history: politics.approvalHistory.map((sample) => ({
                turn: sample.turn,
                approval: sample.approval,
              })),
              updatedTurn: politics.updatedTurn,
            },
      regime:
        politics === null
          ? null
          : {
              id: politics.regime,
              label: REGIME_LABELS[politics.regime] ?? politics.regime,
              governmentType: politics.governmentType,
            },
      legitimacy: politics?.legitimacy ?? null,
      unrest: politics?.unrest ?? null,
      legislature: legislatureFor(world, countryId),
      elections: {
        activeCount: activeElections.length,
        items: unresolvedElections.map((election) => ({
          id: election.id,
          electionType: election.electionType,
          status: election.status,
        })),
      },
      government: governmentFor(world, countryId),
      nationalAxes: nationalAxesFor(world, countryId),
      economy: {
        gdp: country.economy.gdp,
        growthRate: country.economy.growthRate,
        inflationRate: country.economy.inflationRate,
        unemploymentRate: country.economy.unemploymentRate,
        outputGap: country.economy.outputGap,
      },
      economicModel: economicModelFor(world, countryId),
      budget:
        budget === undefined
          ? null
          : {
              revenueTotal: budget.revenue.total,
              spendingTotal: budget.spending.total,
              surplus: budget.surplus,
              debtPrincipal: budget.debt.principal,
              creditRating: budget.creditRating,
            },
      sovereignDebt: sovereignDebtFor(world, countryId),
      corporations: corporations.map((corporation) => ({
        id: corporation.id,
        sector: corporation.sectorType,
      })),
      laws: {
        activeBillCount: activeBills.length,
        enactedLawCount: enactedLaws.length,
        activeBills: activeBills.map((bill) => ({
          id: bill.id,
          title: bill.title,
          status: bill.status,
        })),
        enactedLaws: enactedLaws.map((law) => ({
          id: law.id,
          level: law.level,
          enactedAtTurn: law.enactedAtTurn,
        })),
      },
      latestNews: world.news
        .slice(-4)
        .reverse()
        .map((item) => item.headline),
      counts: {
        parties: parties.length,
        politicians: politicians.length,
        activeElections: activeElections.length,
        upcomingElections: upcomingElections.length,
        activeBills: activeBills.length,
        enactedLaws: enactedLaws.length,
        corporations: corporations.length,
        regions: Object.values(world.regions).filter(
          (region) => region.countryId === countryId,
        ).length,
        unions: Object.values(world.unions).filter(
          (union) => union.countryId === countryId,
        ).length,
        totalReferendums: referendums.length,
        activeReferendums: referendums.filter((referendum) =>
          LIVE_REFERENDUM_STATUSES.has(referendum.status),
        ).length,
        primeRate: world.centralBanks[countryId]?.primeRate ?? null,
        commandEconomy: world.commandEconomy[countryId] !== undefined,
        // No naval/air unit rosters exist in the engine (see ForcesSection).
        navairFormations: 0,
        activeConflicts: conflictsInvolving.length,
        coldWarPrincipal: COLD_WAR_PRINCIPALS.has(countryId),
        coldWarListed:
          world.featureFlags.coldWar === true &&
          world.featureFlags.conflicts === true,
        budgetBalancePctGdp:
          budget !== undefined && budget.gdp > 0
            ? (budget.surplus / budget.gdp) * 100
            : null,
        scotusSeats: world.supremeCourtSeats.filter(
          (seat) => seat.countryId === countryId,
        ).length,
        stockListings: corporations.filter(
          (corporation) => corporation.sharePrice > 0,
        ).length,
        forexRate: world.exchangeRates[countryId]?.rate ?? null,
      },
      unavailable: engineGaps(politics !== null),
    };
  }
}
