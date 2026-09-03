import type { WorldState } from "@ahdclient/engine";

/**
 * Transport-free local summary projections for manifest destinations with
 * no dedicated screen (routeMap "summary" kind). Pure model builders only:
 * no fetch, no Tauri, no React. The shell renders the model; nothing here
 * invents mechanics. Where the engine has no backing collection, the model
 * says so in `notice` instead of filling the gap with adjacent numbers.
 */

export interface SummaryFact {
  label: string;
  value: string;
}

export interface SummaryList {
  heading: string;
  items: string[];
}

export interface SummaryModel {
  routeId: string;
  title: string;
  lede: string;
  /** Engine gap or empty-state honesty note. Null when the record is complete. */
  notice: string | null;
  facts: SummaryFact[];
  lists: SummaryList[];
}

const NO_HOME_REGION =
  "The engine tracks the player by home nation only: there is no home-region " +
  "identity on the player record, so the figures below are aggregates over " +
  "the viewed nation's regions, not a home-state record.";

const NO_HOME_REGION_PERSONAL =
  "The engine carries no home-region identity for the player, so this lists " +
  "the player's own record rather than a home-state record.";

const LIST_CAP = 8;

function withMore(items: string[]): string[] {
  if (items.length <= LIST_CAP) return items;
  return [...items.slice(0, LIST_CAP), `... and ${items.length - LIST_CAP} more`];
}

function countryName(world: WorldState, countryId: string): string {
  return world.countries[countryId]?.name ?? countryId;
}

function regionIdsOf(world: WorldState, countryId: string): string[] {
  return Object.values(world.regions)
    .filter((region) => region.countryId === countryId)
    .map((region) => region.id)
    .sort();
}

function partyName(world: WorldState, partyId: string | null): string {
  if (partyId === null) return "Independent (no party)";
  return world.parties[partyId]?.name ?? partyId;
}

function stateMyParty(world: WorldState, viewedCountryId: string): SummaryModel {
  const partyId = world.player.partyId;
  const orgs = Object.values(world.partyRegions).filter(
    (pr) => pr.countryId === viewedCountryId && (partyId === null ? false : pr.partyId === partyId),
  );
  const intra = world.statePartyElections.filter(
    (e) => e.countryId === viewedCountryId && (partyId === null ? false : e.partyId === partyId),
  );
  return {
    routeId: "state.my-party",
    title: "My Party (State)",
    lede: `State-level organization of ${partyName(world, partyId)} across the viewed nation's regions.`,
    notice: NO_HOME_REGION,
    facts: [
      { label: "Membership", value: partyName(world, partyId) },
      { label: "Viewed nation", value: `${countryName(world, viewedCountryId)} (${viewedCountryId})` },
      { label: "Region orgs held", value: String(orgs.length) },
      { label: "Intra-party state races", value: String(intra.length) },
    ],
    lists: [
      {
        heading: "Region organization",
        items: withMore(
          orgs
            .sort((a, b) => a.regionId.localeCompare(b.regionId))
            .map((pr) => `${pr.regionId}: org ${pr.organization}, reg ${pr.registration}`),
        ),
      },
    ],
  };
}

function stateOverview(world: WorldState, viewedCountryId: string): SummaryModel {
  const regionIds = regionIdsOf(world, viewedCountryId);
  const governors = regionIds.map((id) => world.governors[id]);
  const filled = governors.filter((g) => g?.governorId).length;
  const budgets = regionIds.filter((id) => world.regionalBudgets[id] !== undefined).length;
  const bills = world.stateBills.filter((b) => b.countryId === viewedCountryId).length;
  return {
    routeId: "state.overview",
    title: "State Overview",
    lede: `Regional footprint of ${countryName(world, viewedCountryId)}: regions, governors, and state books.`,
    notice: NO_HOME_REGION,
    facts: [
      { label: "Regions", value: String(regionIds.length) },
      { label: "Governors seated", value: `${filled} of ${regionIds.length}` },
      { label: "Regional budgets", value: String(budgets) },
      { label: "State bills on file", value: String(bills) },
    ],
    lists: [{ heading: "Regions", items: withMore(regionIds) }],
  };
}

function stateEconomy(world: WorldState, viewedCountryId: string): SummaryModel {
  const regionIds = regionIdsOf(world, viewedCountryId);
  const budgets = regionIds
    .map((id) => world.regionalBudgets[id])
    .filter((b) => b !== undefined);
  const revenue = budgets.reduce((sum, b) => sum + b.revenue.total, 0);
  const spending = budgets.reduce((sum, b) => sum + b.spending.total, 0);
  const capital = regionIds.reduce((sum, id) => sum + (world.capitalStock[id] ?? 0), 0);
  const capacities = regionIds.filter((id) => world.stateResourceCapacities[id] !== undefined).length;
  return {
    routeId: "state.economy",
    title: "State Economy",
    lede: `Regional books of ${countryName(world, viewedCountryId)}: revenue, spending, capital, and resource ceilings.`,
    notice: NO_HOME_REGION,
    facts: [
      { label: "Regional budgets", value: `${budgets.length} of ${regionIds.length} regions` },
      { label: "Regional revenue", value: String(Math.round(revenue)) },
      { label: "Regional spending", value: String(Math.round(spending)) },
      { label: "Regional balance", value: String(Math.round(revenue - spending)) },
      { label: "Regional capital stock", value: String(Math.round(capital)) },
      { label: "Resource ceilings mapped", value: String(capacities) },
    ],
    lists: [
      {
        heading: "Balance by region",
        items: withMore(
          budgets
            .sort((a, b) => a.regionId.localeCompare(b.regionId))
            .map((b) => `${b.regionId}: balance ${Math.round(b.balance)} (deficits x${b.consecutiveDeficits})`),
        ),
      },
    ],
  };
}

function stateElections(world: WorldState, viewedCountryId: string): SummaryModel {
  const regionIds = new Set(regionIdsOf(world, viewedCountryId));
  const intra = world.statePartyElections.filter((e) => e.countryId === viewedCountryId);
  const district = world.elections.filter(
    (e) => e.countryId === viewedCountryId && e.state !== undefined && regionIds.has(e.state),
  );
  const vacant = regionIdsOf(world, viewedCountryId).filter(
    (id) => world.governors[id]?.governorId == null,
  );
  return {
    routeId: "state.elections",
    title: "State Elections",
    lede: `Sub-national contests in ${countryName(world, viewedCountryId)}: intra-party races, district races, and vacant governorships.`,
    notice: NO_HOME_REGION,
    facts: [
      { label: "Intra-party state races", value: String(intra.length) },
      { label: "District/state races", value: String(district.length) },
      { label: "Vacant governorships", value: String(vacant.length) },
    ],
    lists: [
      {
        heading: "Intra-party races",
        items: withMore(
          intra
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((e) => `${e.id}: ${e.position}, ${e.status}`),
        ),
      },
      {
        heading: "District races",
        items: withMore(
          district
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((e) => `${e.id}: ${e.electionType} in ${e.state}, ${e.status}`),
        ),
      },
    ],
  };
}

function stateLegislature(world: WorldState, viewedCountryId: string): SummaryModel {
  const bills = world.stateBills.filter((b) => b.countryId === viewedCountryId);
  const byStatus = new Map<string, number>();
  for (const bill of bills) byStatus.set(bill.status, (byStatus.get(bill.status) ?? 0) + 1);
  return {
    routeId: "state.legislature",
    title: "State Legislature",
    lede: `Regional bills filed in ${countryName(world, viewedCountryId)}. The national legislature stays on its own screen.`,
    notice: NO_HOME_REGION,
    facts: [
      { label: "State bills", value: String(bills.length) },
      ...[...byStatus.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([status, count]): SummaryFact => ({ label: `Bills: ${status}`, value: String(count) })),
    ],
    lists: [
      {
        heading: "State bills",
        items: withMore(
          bills
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((b) => `${b.title} (${b.status})`),
        ),
      },
    ],
  };
}

function stateOffice(world: WorldState, viewedCountryId: string): SummaryModel {
  const regionIds = regionIdsOf(world, viewedCountryId);
  const seats = regionIds.map((id) => ({ id, gov: world.governors[id] }));
  const filled = seats.filter((s) => s.gov?.governorId);
  const playerHolds = seats.some((s) => s.gov?.governorId === "player");
  const orders = world.governorOrders.filter((o) => o.countryId === viewedCountryId).length;
  const addresses = world.governorAddresses.filter((a) => a.countryId === viewedCountryId).length;
  return {
    routeId: "state.office",
    title: "Office (State)",
    lede: `Governorships of ${countryName(world, viewedCountryId)}: who holds each state office and what it has issued.`,
    notice: NO_HOME_REGION,
    facts: [
      { label: "Governorships filled", value: `${filled.length} of ${regionIds.length}` },
      { label: "Player holds an office", value: playerHolds ? "Yes" : "No" },
      { label: "Governor orders", value: String(orders) },
      { label: "Governor addresses", value: String(addresses) },
    ],
    lists: [
      {
        heading: "Governors",
        items: withMore(
          seats.map((s) =>
            s.gov?.governorId
              ? `${s.id}: ${s.gov.governorName ?? s.gov.governorId} (${s.gov.governorParty ?? "no party"})`
              : `${s.id}: vacant`,
          ),
        ),
      },
    ],
  };
}

function stateMyElection(world: WorldState, viewedCountryId: string): SummaryModel {
  const mine = world.elections.filter(
    (e) => e.status !== "resolved" && e.candidates.some((c) => c.id === "player"),
  );
  return {
    routeId: "state.my-election",
    title: "My Election (State)",
    lede: "The player's own live candidacies, read from the election records.",
    notice:
      mine.length === 0
        ? `No active candidacy for the player in the local election records. ${NO_HOME_REGION_PERSONAL}`
        : NO_HOME_REGION_PERSONAL,
    facts: [
      { label: "Active candidacies", value: String(mine.length) },
      { label: "Viewed nation", value: `${countryName(world, viewedCountryId)} (${viewedCountryId})` },
    ],
    lists: [
      {
        heading: "My races",
        items: withMore(
          mine
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((e) => `${e.id}: ${e.electionType} in ${e.countryId}${e.state ? `/${e.state}` : ""}, ${e.status}`),
        ),
      },
    ],
  };
}

function stateMyOffice(world: WorldState, _viewedCountryId: string): SummaryModel {
  const seats = world.cabinetMembers.filter((m) => m.characterId === "player");
  const nominations = world.cabinetNominations.filter((n) => n.nomineeId === "player");
  return {
    routeId: "state.my-office",
    title: "My Office (State)",
    lede: "Cabinet seats and nominations held by the player in the local world.",
    notice:
      seats.length === 0 && nominations.length === 0
        ? `The player holds no cabinet seat and has no live nomination in the local world. ${NO_HOME_REGION_PERSONAL}`
        : NO_HOME_REGION_PERSONAL,
    facts: [
      { label: "Cabinet seats held", value: String(seats.length) },
      { label: "Live nominations", value: String(nominations.length) },
    ],
    lists: [
      {
        heading: "Seats",
        items: withMore(
          seats.map((m) => `${m.countryId} ${m.positionId}${m.acting ? " (acting)" : ""}`),
        ),
      },
      {
        heading: "Nominations",
        items: withMore(
          nominations.map((n) => `${n.countryId} ${n.positionId}: ${n.status} (${n.votesFor}-${n.votesAgainst}-${n.votesAbstain})`),
        ),
      },
    ],
  };
}

function nationCabinetOffice(world: WorldState, viewedCountryId: string): SummaryModel {
  const members = world.cabinetMembers.filter((m) => m.countryId === viewedCountryId);
  const nominations = world.cabinetNominations.filter((n) => n.countryId === viewedCountryId);
  const pending = nominations.filter((n) => n.status !== "confirmed" && n.status !== "rejected" && n.status !== "withdrawn");
  const playerSeat = members.find((m) => m.characterId === "player");
  return {
    routeId: "nation.cabinet-office",
    title: "Cabinet Office",
    lede: `Cabinet seats and nominations of ${countryName(world, viewedCountryId)}.`,
    notice:
      playerSeat === undefined
        ? "The player holds no cabinet seat in the viewed nation: this is the full roster, not a personal office record."
        : null,
    facts: [
      { label: "Seats filled", value: String(members.length) },
      { label: "Acting holders", value: String(members.filter((m) => m.acting).length) },
      { label: "Nominations on file", value: String(nominations.length) },
      { label: "Nominations pending", value: String(pending.length) },
      { label: "Player seat", value: playerSeat ? playerSeat.positionId : "None" },
    ],
    lists: [
      {
        heading: "Members",
        items: withMore(
          members
            .sort((a, b) => a.positionId.localeCompare(b.positionId))
            .map((m) => `${m.positionId}: ${m.characterName}${m.acting ? " (acting)" : ""}`),
        ),
      },
      {
        heading: "Nominations",
        items: withMore(
          nominations
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((n) => `${n.positionId}: ${n.nomineeName}, ${n.status}`),
        ),
      },
    ],
  };
}

function nationPoliticalMetrics(world: WorldState, viewedCountryId: string): SummaryModel {
  const overview = world.countryPolitics[viewedCountryId];
  const metrics = world.nationalMetrics[viewedCountryId] ?? {};
  const entries = Object.entries(metrics).sort((a, b) => a[0].localeCompare(b[0]));
  const model = world.economicModels[viewedCountryId];
  return {
    routeId: "nation.politics.political-metrics",
    title: "Political Metrics",
    lede: `Political registry of ${countryName(world, viewedCountryId)}: approval, regime, legitimacy, and metric families.`,
    notice:
      overview === undefined
        ? "No political overview is seeded for the viewed nation: the engine carries one entry per playable country only."
        : null,
    facts: [
      { label: "Approval", value: overview ? String(overview.approval) : "None" },
      { label: "Regime", value: overview ? `${overview.regime} (${overview.governmentType})` : "None" },
      { label: "Legitimacy", value: overview ? String(overview.legitimacy) : "None" },
      { label: "Unrest", value: overview ? String(overview.unrest) : "None" },
      { label: "Metric families", value: String(entries.length) },
      { label: "Economic model", value: model ? `${model.current} (${model.intensity})` : "None" },
    ],
    lists: [
      {
        heading: "National metrics",
        items: withMore(entries.map(([key, metric]) => `${key}: ${metric.value}`)),
      },
    ],
  };
}

function nationCharters(world: WorldState, viewedCountryId: string): SummaryModel {
  const charters = world.charters.filter((c) => c.countryId === viewedCountryId);
  const byStatus = new Map<string, number>();
  for (const charter of charters) byStatus.set(charter.status, (byStatus.get(charter.status) ?? 0) + 1);
  return {
    routeId: "nation.politics.charters",
    title: "Party Charters",
    lede: `Charter records filed in ${countryName(world, viewedCountryId)}.`,
    notice:
      charters.length === 0
        ? "No charters are on file for the viewed nation in the local world."
        : null,
    facts: [
      { label: "Charters", value: String(charters.length) },
      ...[...byStatus.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([status, count]): SummaryFact => ({ label: `Charters: ${status}`, value: String(count) })),
    ],
    lists: [
      {
        heading: "Charters",
        items: withMore(
          charters
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((c) => `${c.id}: ${c.status}, party ${c.partyId ?? "unassigned"}`),
        ),
      },
    ],
  };
}

function worldCrises(world: WorldState): SummaryModel {
  const active = world.crises.filter((c) => c.status === "active");
  const resolved = world.crises.filter((c) => c.status === "resolved");
  return {
    routeId: "world.crises",
    title: "Crises",
    lede: "Crisis records in the local world, active and resolved.",
    notice:
      world.crises.length === 0
        ? "No crisis records exist in the local world yet."
        : null,
    facts: [
      { label: "Active crises", value: String(active.length) },
      { label: "Resolved crises", value: String(resolved.length) },
      { label: "Global scope", value: String(world.crises.filter((c) => c.scope === "global").length) },
      { label: "Active world modifiers", value: String(world.activeWorldModifiers.length) },
    ],
    lists: [
      {
        heading: "Crises",
        items: withMore(
          [...world.crises]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((c) => `${c.name} (${c.kind}, ${c.scope}, ${c.status}, turn ${c.startTurn})`),
        ),
      },
    ],
  };
}

function worldGermanQuestion(world: WorldState): SummaryModel {
  const matching = world.crises.filter((c) =>
    /german|settlement|berlin|reunif/i.test(`${c.name} ${c.kind} ${c.description}`),
  );
  return {
    routeId: "world.german-question",
    title: "The German Question",
    lede: "Settlement records plus the crisis records that read as the standing settlement crisis.",
    notice:
      "The engine carries no dedicated German Question collection: this is the settlements ledger joined to matching crisis records, shown only as a standing crisis, never as a flag alone." +
      (world.settlements.length === 0 && matching.length === 0
        ? " Neither ledger has an entry in this world yet."
        : ""),
    facts: [
      { label: "Settlements", value: String(world.settlements.length) },
      { label: "Matching crises", value: String(matching.length) },
    ],
    lists: [
      {
        heading: "Settlements",
        items: withMore(
          [...world.settlements]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((s) => `${s.id}: ${s.path}, winner ${s.winner}, turn ${s.turn}`),
        ),
      },
      {
        heading: "Matching crises",
        items: withMore(
          matching
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((c) => `${c.name} (${c.kind}, ${c.status})`),
        ),
      },
    ],
  };
}

function worldInternationalOrgs(world: WorldState, viewedCountryId: string): SummaryModel {
  const orgs = Object.values(world.internationalOrgs).sort((a, b) => a.id.localeCompare(b.id));
  return {
    routeId: "world.international-orgs",
    title: "International Orgs",
    lede: "Organization membership as tracked locally: org exists, these countries are members. No dues, sanctions, or leadership mechanics are modeled.",
    notice: null,
    facts: [
      { label: "Organizations", value: String(orgs.length) },
      {
        label: "Viewed nation memberships",
        value: String(orgs.filter((o) => o.members.includes(viewedCountryId)).length),
      },
    ],
    lists: [
      {
        heading: "Organizations",
        items: withMore(
          orgs.map((o) =>
            `${o.name} (${o.foundedYear}): ${o.members.length} members` +
            (o.members.includes(viewedCountryId) ? ", viewed nation is a member" : ""),
          ),
        ),
      },
    ],
  };
}

function worldSectors(world: WorldState, viewedCountryId: string): SummaryModel {
  const corps = Object.values(world.corporations);
  const bySector = new Map<string, number>();
  for (const corp of corps) bySector.set(corp.sectorType, (bySector.get(corp.sectorType) ?? 0) + 1);
  const viewed = corps
    .filter((c) => c.countryId === viewedCountryId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const pools = Object.values(world.unownedSectors);
  return {
    routeId: "world.sectors",
    title: "Sectors",
    lede: "Sector footprint from chartered corporations plus the unowned-sector revenue pools.",
    notice: null,
    facts: [
      { label: "Chartered corporations", value: String(corps.length) },
      { label: "Sectors with charters", value: String(bySector.size) },
      { label: "Unowned-sector pools", value: String(pools.length) },
      { label: "Viewed nation corps", value: String(viewed.length) },
    ],
    lists: [
      {
        heading: "Corporations by sector",
        items: withMore(
          [...bySector.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([sector, count]) => `${sector}: ${count}`),
        ),
      },
      {
        heading: `Corporations in ${viewedCountryId}`,
        items: withMore(
          viewed.map((c) => `${c.tickerSymbol} (${c.sectorType}): revenue ${Math.round(c.revenue)}, growth ${c.currentGrowthRate}%`),
        ),
      },
    ],
  };
}

function worldTrade(world: WorldState, viewedCountryId: string): SummaryModel {
  const budgets = Object.values(world.budgets).sort((a, b) => a.countryId.localeCompare(b.countryId));
  const rates = Object.values(world.exchangeRates).sort((a, b) => a.countryId.localeCompare(b.countryId));
  const viewed = world.budgets[viewedCountryId]?.economicFactors.tradeGrowth;
  return {
    routeId: "world.trade",
    title: "Trade",
    lede: "Trade as the engine models it: a per-country growth factor plus the exchange rates behind competitiveness.",
    notice:
      "The engine carries no trade-agreement or trade-deal collection: there are no pacts to list, only the modeled growth factor per country.",
    facts: [
      { label: "Viewed nation trade growth", value: viewed === undefined ? "None" : String(viewed) },
      { label: "Countries with budgets", value: String(budgets.length) },
      { label: "Exchange rates tracked", value: String(rates.length) },
    ],
    lists: [
      {
        heading: "Trade growth by country",
        items: withMore(
          budgets.map((b) => `${b.countryId}: ${b.economicFactors.tradeGrowth}`),
        ),
      },
      {
        heading: "Exchange rates (local per anchor)",
        items: withMore(
          rates.map((r) => `${r.countryId} ${r.currencyCode}: ${r.rate}`),
        ),
      },
    ],
  };
}

function worldImf(world: WorldState): SummaryModel {
  const unions = Object.values(world.currencyUnions).sort((a, b) => a.id.localeCompare(b.id));
  const bonds = Object.values(world.bonds).sort((a, b) => a.id.localeCompare(b.id));
  return {
    routeId: "world.imf",
    title: "IMF",
    lede: "Sovereign-finance state adjacent to the IMF page. The engine models no IMF quotas, programs, or loans.",
    notice:
      "No IMF mechanic exists in the local world: the rows below are the adjacent finance records (bonds, loans, currency unions), not IMF programs.",
    facts: [
      { label: "Sovereign bond tranches", value: String(bonds.length) },
      { label: "Bank loans on book", value: String(world.bankLoans.length) },
      { label: "Currency unions", value: String(unions.length) },
      { label: "Deposit insurance funds", value: String(Object.keys(world.depositInsurance).length) },
    ],
    lists: [
      {
        heading: "Currency unions",
        items: withMore(
          unions.map((u) => `${u.id}: ${u.members.length} members${u.active ? ", active" : ""}`),
        ),
      },
      {
        heading: "Sovereign bonds",
        items: withMore(bonds.map((b) => b.id)),
      },
    ],
  };
}

export function buildSummary(
  routeId: string,
  world: WorldState,
  viewedCountryId: string,
): SummaryModel | null {
  switch (routeId) {
    case "state.my-party": return stateMyParty(world, viewedCountryId);
    case "state.overview": return stateOverview(world, viewedCountryId);
    case "state.economy": return stateEconomy(world, viewedCountryId);
    case "state.elections": return stateElections(world, viewedCountryId);
    case "state.legislature": return stateLegislature(world, viewedCountryId);
    case "state.office": return stateOffice(world, viewedCountryId);
    case "state.my-election": return stateMyElection(world, viewedCountryId);
    case "state.my-office": return stateMyOffice(world, viewedCountryId);
    case "nation.cabinet-office": return nationCabinetOffice(world, viewedCountryId);
    case "nation.politics.political-metrics": return nationPoliticalMetrics(world, viewedCountryId);
    case "nation.politics.charters": return nationCharters(world, viewedCountryId);
    case "world.crises": return worldCrises(world);
    case "world.german-question": return worldGermanQuestion(world);
    case "world.international-orgs": return worldInternationalOrgs(world, viewedCountryId);
    case "world.sectors": return worldSectors(world, viewedCountryId);
    case "world.trade": return worldTrade(world, viewedCountryId);
    case "world.imf": return worldImf(world);
    default: return null;
  }
}
