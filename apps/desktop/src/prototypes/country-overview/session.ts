import {
  advanceTurn,
  createWorld,
  type Chamber,
  type Party,
  type Politician,
  type WorldState,
} from "@ahdclient/engine";

/**
 * PROTOTYPE QUESTION
 * Can a multiplayer-shaped country overview consume the existing local engine
 * through one small, platform-neutral interface instead of knowing WorldState,
 * Mongo collections, Next routes, Tauri, or Android?
 */

export interface OverviewLeader {
  label: string;
  name: string | null;
  party: string | null;
}

export interface OverviewStat {
  label: string;
  value: string;
  detail: string;
  tone: "positive" | "warning" | "negative" | "neutral";
}

export interface OverviewParty {
  id: string;
  name: string;
  abbreviation: string;
  color: string;
  seats: number;
  organization: number;
}

export interface OverviewDirectoryItem {
  id: string;
  label: string;
  detail: string;
  figure: string;
}

export interface CountryOverviewModel {
  country: {
    id: string;
    name: string;
    descriptor: string;
    regionLabel: string;
    governmentType: string;
  };
  world: {
    era: string;
    date: string;
    turn: number;
    seed: string;
  };
  player: {
    name: string;
    actions: number;
    cash: number;
    funds: number;
    party: string;
  };
  registration: { label: string; tone: "active" | "beta" };
  leaders: OverviewLeader[];
  economy: OverviewStat[];
  legislature: {
    name: string;
    seats: number;
    vacancies: number;
    parties: OverviewParty[];
  };
  chamberBalance: {
    economic: number;
    social: number;
    representedParties: number;
  };
  directory: Array<{
    label: string;
    items: OverviewDirectoryItem[];
  }>;
  latestNews: string[];
}

export interface CountryOverviewReader {
  read(countryId: string): Promise<CountryOverviewModel>;
}

export interface PrototypeLocalRuntime {
  reader: CountryOverviewReader;
  advanceTurn(): Promise<void>;
}

const COUNTRY_DESCRIPTORS: Record<string, string> = {
  US: "A federal presidential republic balancing fifty states, two chambers, and a contested national mandate.",
  UK: "A parliamentary system where confidence, party discipline, and the Commons decide who governs.",
  RU: "A union of republics governed through party institutions and the Supreme Soviet.",
  DD: "A planned one-party state whose political and economic institutions move together.",
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function toneForRate(
  value: number,
  goodBelow: number,
  warningBelow: number,
): NonNullable<OverviewStat["tone"]> {
  if (value <= goodBelow) return "positive";
  if (value <= warningBelow) return "warning";
  return "negative";
}

function politicianName(
  world: WorldState,
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  if (id === "player") return world.player.name;
  return (
    world.politicians.find((politician) => politician.id === id)?.name ?? null
  );
}

function partyLabel(
  world: WorldState,
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  return world.parties[id]?.abbreviation ?? id;
}

function primaryChamber(world: WorldState, countryId: string): Chamber | null {
  const legislature = world.legislatures[countryId];
  if (!legislature) return null;
  return (
    legislature.chambers.find((chamber) => chamber.elected) ??
    legislature.chambers[0] ??
    null
  );
}

function leadersFor(world: WorldState, countryId: string): OverviewLeader[] {
  const executive = world.executives[countryId];
  const government = world.governments[countryId];
  const leaders: OverviewLeader[] = [];

  if (executive) {
    leaders.push({
      label: "President",
      name: politicianName(world, executive.presidentId),
      party: partyLabel(world, executive.presidentParty),
    });
    leaders.push({
      label: "Vice President",
      name: politicianName(world, executive.vicePresidentId),
      party: partyLabel(world, executive.vicePresidentParty),
    });
  }

  if (government) {
    leaders.push({
      label: countryId === "UK" ? "Prime Minister" : "Head of Government",
      name: politicianName(world, government.pmPoliticianId),
      party: partyLabel(world, government.governingPartyId),
    });
  }

  if (leaders.length === 0) {
    leaders.push({ label: "Executive", name: null, party: null });
  }
  return leaders;
}

function chamberBalanceFor(
  parties: Party[],
  chamber: Chamber | null,
): { economic: number; social: number } {
  if (!chamber) return { economic: 0, social: 0 };
  let seats = 0;
  let economic = 0;
  let social = 0;
  for (const party of parties) {
    const weight = chamber.composition.seatsByParty[party.id] ?? 0;
    seats += weight;
    economic += party.economicPosition * weight;
    social += party.socialPosition * weight;
  }
  return seats > 0
    ? { economic: economic / seats, social: social / seats }
    : { economic: 0, social: 0 };
}

function modelFromWorld(
  world: WorldState,
  countryId: string,
): CountryOverviewModel {
  const country = world.countries[countryId];
  if (!country) throw new Error(`Unknown country ${countryId}`);
  const legislature = world.legislatures[countryId];
  const chamber = primaryChamber(world, countryId);
  const parties = Object.values(world.parties)
    .filter((party) => party.countryId === countryId)
    .sort((left, right) => left.name.localeCompare(right.name));
  const politicians: Politician[] = world.politicians.filter(
    (politician) => politician.countryId === countryId,
  );
  const partyViews: OverviewParty[] = parties
    .map((party) => ({
      id: party.id,
      name: party.name,
      abbreviation: party.abbreviation,
      color: party.color,
      seats: chamber?.composition.seatsByParty[party.id] ?? 0,
      organization: party.organization,
    }))
    .filter((party) => party.seats > 0 || party.organization > 0)
    .sort(
      (left, right) =>
        right.seats - left.seats || left.name.localeCompare(right.name),
    );
  const chamberBalance = chamberBalanceFor(parties, chamber);
  const electionCount = world.elections.filter(
    (election) =>
      election.countryId === countryId && election.status !== "resolved",
  ).length;
  const activeBillCount = world.bills.filter(
    (bill) =>
      bill.countryId === countryId &&
      !["signed", "failed", "withdrawn", "override_failed"].includes(
        bill.status,
      ),
  ).length;
  const lawCount = world.enactedLaws.filter(
    (law) => law.countryId === countryId,
  ).length;
  const corporationCount = Object.values(world.corporations).filter(
    (corporation) => corporation.countryId === countryId,
  ).length;
  const playerParty = world.player.partyId
    ? partyLabel(world, world.player.partyId)
    : "Independent";
  const economy = country.economy;
  const government = world.governments[countryId];
  const governmentType = world.executives[countryId]
    ? "Presidential republic"
    : government
      ? government.formationType === "coalition"
        ? "Parliamentary coalition"
        : "Parliamentary government"
      : "National government";

  return {
    country: {
      id: country.id,
      name: country.name,
      descriptor:
        COUNTRY_DESCRIPTORS[countryId] ??
        `${country.name}'s national institutions and economy.`,
      regionLabel:
        countryId === "US" ? "States and territories" : "National institutions",
      governmentType,
    },
    world: {
      era: world.meta.era,
      date: world.meta.date,
      turn: world.meta.turn,
      seed: world.meta.seed,
    },
    player: {
      name: world.player.name,
      actions: world.player.actions,
      cash: world.player.cash,
      funds: world.player.funds,
      party: playerParty ?? "Independent",
    },
    registration: {
      label: "Local world",
      tone: country.playable ? "active" : "beta",
    },
    leaders: leadersFor(world, countryId),
    economy: [
      {
        label: "GDP",
        value: `$${formatMoney(economy.gdp)}M`,
        detail: "Nominal output",
        tone: "neutral",
      },
      {
        label: "Growth",
        value: formatPercent(economy.growthRate),
        detail: "Annualized",
        tone:
          economy.growthRate >= 0.02
            ? "positive"
            : economy.growthRate >= 0
              ? "warning"
              : "negative",
      },
      {
        label: "Inflation",
        value: formatPercent(economy.inflationRate),
        detail: "Annualized",
        tone: toneForRate(economy.inflationRate, 0.03, 0.07),
      },
      {
        label: "Unemployment",
        value: formatPercent(economy.unemploymentRate),
        detail: "Labor force",
        tone: toneForRate(economy.unemploymentRate, 0.05, 0.09),
      },
      {
        label: "Output gap",
        value: `${economy.outputGap > 0 ? "+" : ""}${economy.outputGap.toFixed(1)}%`,
        detail: "Potential output",
        tone: Math.abs(economy.outputGap) < 2 ? "positive" : "warning",
      },
    ],
    legislature: {
      name: legislature?.name ?? "No legislature",
      seats: chamber?.seats ?? 0,
      vacancies: chamber?.composition.vacancies ?? 0,
      parties: partyViews,
    },
    chamberBalance: {
      ...chamberBalance,
      representedParties: partyViews.length,
    },
    directory: [
      {
        label: "Politics",
        items: [
          {
            id: "government",
            label: "Government",
            detail: governmentType,
            figure: leadersFor(world, countryId)[0]?.name ?? "Vacant",
          },
          {
            id: "legislature",
            label: legislature?.name ?? "Legislature",
            detail: chamber?.name ?? "No active chamber",
            figure: `${chamber?.seats ?? 0} seats`,
          },
          {
            id: "parties",
            label: "Political parties",
            detail: "Organization, leadership, and membership",
            figure: String(parties.length),
          },
          {
            id: "elections",
            label: "Elections",
            detail: "Active and upcoming contests",
            figure: String(electionCount),
          },
        ],
      },
      {
        label: "State and economy",
        items: [
          {
            id: "economy",
            label: "National economy",
            detail: "Output, prices, employment, and growth",
            figure: formatPercent(economy.growthRate),
          },
          {
            id: "budget",
            label: "Budget",
            detail: "Revenue, spending, debt, and taxation",
            figure: world.budgets[countryId]?.creditRating ?? "Not rated",
          },
          {
            id: "corporations",
            label: "Corporations",
            detail: "Domestic firms and productive sectors",
            figure: String(corporationCount),
          },
          {
            id: "laws",
            label: "Laws and bills",
            detail: `${activeBillCount} active proposals`,
            figure: String(lawCount),
          },
        ],
      },
    ],
    latestNews: world.news
      .slice(-4)
      .reverse()
      .map((item) => item.headline),
  };
}

export function createPrototypeRuntime(): PrototypeLocalRuntime {
  const world = createWorld({
    seed: "shared-country-overview-prototype",
    playerName: "Alex Morgan",
    countryId: "US",
    era: "1953",
  });

  return {
    reader: {
      async read(countryId) {
        return modelFromWorld(world, countryId);
      },
    },
    async advanceTurn() {
      advanceTurn(world);
    },
  };
}
