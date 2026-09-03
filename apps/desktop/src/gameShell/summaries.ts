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
  "This migrated world predates home-region selection. Choose one in the Character panel to enable State navigation.";

const LIST_CAP = 8;

function withMore(items: string[]): string[] {
  if (items.length <= LIST_CAP) return items;
  return [...items.slice(0, LIST_CAP), `... and ${items.length - LIST_CAP} more`];
}

function countryName(world: WorldState, countryId: string): string {
  return world.countries[countryId]?.name ?? countryId;
}

function playerHomeRegion(world: WorldState): WorldState["regions"][string] | null {
  const id = world.player.homeRegionId;
  if (!id) return null;
  const region = world.regions[id];
  return region?.countryId === world.player.countryId ? region : null;
}

function partyName(world: WorldState, partyId: string | null): string {
  if (partyId === null) return "Independent (no party)";
  return world.parties[partyId]?.name ?? partyId;
}

function stateMyParty(world: WorldState, viewedCountryId: string): SummaryModel {
  const partyId = world.player.partyId;
  const home = playerHomeRegion(world);
  const orgs = Object.values(world.partyRegions).filter(
    (pr) => pr.regionId === home?.id && (partyId === null ? false : pr.partyId === partyId),
  );
  const intra = world.statePartyElections.filter(
    (e) => e.regionId === home?.id && (partyId === null ? false : e.partyId === partyId),
  );
  return {
    routeId: "state.my-party",
    title: "My Party (State)",
    lede: home
      ? `State-level organization of ${partyName(world, partyId)} in ${home.name}.`
      : `State-level organization of ${partyName(world, partyId)}.`,
    notice: home ? null : NO_HOME_REGION,
    facts: [
      { label: "Membership", value: partyName(world, partyId) },
      { label: "Viewed nation", value: `${countryName(world, viewedCountryId)} (${viewedCountryId})` },
      { label: "Home state or region", value: home ? `${home.name} (${home.id})` : "Not selected" },
      { label: "Region organization records", value: String(orgs.length) },
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

function stateOverview(world: WorldState, _viewedCountryId: string): SummaryModel {
  const home = playerHomeRegion(world);
  const governor = home ? world.governors[home.id] : undefined;
  const budget = home ? world.regionalBudgets[home.id] : undefined;
  return {
    routeId: "state.overview",
    title: "State Overview",
    lede: home
      ? `${home.name}, the player's home region in ${countryName(world, home.countryId)}.`
      : `Home-region overview for ${countryName(world, world.player.countryId)}.`,
    notice: home ? null : NO_HOME_REGION,
    facts: [
      { label: "Region", value: home ? `${home.name} (${home.id})` : "Not selected" },
      { label: "Population", value: home?.population?.toLocaleString() ?? "Not recorded" },
      { label: "Regional GDP", value: home?.gdp === undefined ? "Not recorded" : String(Math.round(home.gdp)) },
      { label: "Governor", value: governor?.governorName ?? governor?.governorId ?? "Vacant or unsupported" },
      { label: "Regional budget", value: budget ? `Balance ${Math.round(budget.balance)}` : "Not recorded" },
    ],
    lists: [],
  };
}

function stateEconomy(world: WorldState, _viewedCountryId: string): SummaryModel {
  const home = playerHomeRegion(world);
  const budget = home ? world.regionalBudgets[home.id] : undefined;
  const capital = home ? world.capitalStock[home.id] : undefined;
  const capacities = home ? world.stateResourceCapacities[home.id] : undefined;
  return {
    routeId: "state.economy",
    title: "State Economy",
    lede: home
      ? `Regional books, capital, and resources for ${home.name}.`
      : `Home-region economy for ${countryName(world, world.player.countryId)}.`,
    notice: home ? null : NO_HOME_REGION,
    facts: [
      { label: "Home state or region", value: home ? `${home.name} (${home.id})` : "Not selected" },
      { label: "Regional GDP", value: home?.gdp === undefined ? "Not recorded" : String(Math.round(home.gdp)) },
      { label: "Revenue", value: budget ? String(Math.round(budget.revenue.total)) : "Not recorded" },
      { label: "Spending", value: budget ? String(Math.round(budget.spending.total)) : "Not recorded" },
      { label: "Balance", value: budget ? String(Math.round(budget.balance)) : "Not recorded" },
      { label: "Capital stock", value: capital === undefined ? "Not recorded" : String(Math.round(capital)) },
      { label: "Resource capacity", value: capacities === undefined ? "Not recorded" : "Mapped" },
    ],
    lists: [],
  };
}

function stateElections(world: WorldState, _viewedCountryId: string): SummaryModel {
  const home = playerHomeRegion(world);
  const intra = world.statePartyElections.filter((e) => e.regionId === home?.id);
  const district = world.elections.filter(
    (e) => e.countryId === world.player.countryId && e.state === home?.id,
  );
  const governorVacant = home ? world.governors[home.id]?.governorId == null : false;
  return {
    routeId: "state.elections",
    title: "State Elections",
    lede: home
      ? `Sub-national contests in ${home.name}: intra-party races, district races, and the governorship.`
      : `Home-region contests in ${countryName(world, world.player.countryId)}.`,
    notice: home ? null : NO_HOME_REGION,
    facts: [
      { label: "Home state or region", value: home ? `${home.name} (${home.id})` : "Not selected" },
      { label: "Intra-party state races", value: String(intra.length) },
      { label: "District/state races", value: String(district.length) },
      { label: "Governorship vacant", value: home ? (governorVacant ? "Yes" : "No") : "Unknown" },
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

function stateLegislature(world: WorldState, _viewedCountryId: string): SummaryModel {
  const home = playerHomeRegion(world);
  return {
    routeId: "state.legislature",
    title: "State Legislature",
    lede: home
      ? `State legislature for ${home.name}.`
      : `Home-region legislature for ${countryName(world, world.player.countryId)}.`,
    notice: home
      ? "The engine's state-bill records do not carry a region id, so national totals are not presented as this state's legislature."
      : NO_HOME_REGION,
    facts: [
      { label: "Home state or region", value: home ? `${home.name} (${home.id})` : "Not selected" },
      { label: "Lower-house seats", value: home?.houseSeats === undefined ? "Not recorded" : String(home.houseSeats) },
      { label: "Upper-house seats", value: home?.senateSeats === undefined ? "Not recorded" : String(home.senateSeats) },
      { label: "Region-scoped bills", value: "Not represented by the engine" },
    ],
    lists: [],
  };
}

function stateOffice(world: WorldState, _viewedCountryId: string): SummaryModel {
  const home = playerHomeRegion(world);
  const governor = home ? world.governors[home.id] : undefined;
  const orders = world.governorOrders.filter((order) => order.stateId === home?.id);
  const addresses = world.governorAddresses.filter((address) => address.stateId === home?.id);
  return {
    routeId: "state.office",
    title: "Office (State)",
    lede: home ? `Executive office of ${home.name}.` : "The player's home-region executive office.",
    notice: home
      ? governor === undefined
        ? "This country's regional executive office is not represented by the engine."
        : null
      : NO_HOME_REGION,
    facts: [
      { label: "Home state or region", value: home ? `${home.name} (${home.id})` : "Not selected" },
      { label: "Officeholder", value: governor?.governorName ?? governor?.governorId ?? "Vacant or unsupported" },
      { label: "Player holds this office", value: governor?.governorId === "player" ? "Yes" : "No" },
      { label: "Governor actions", value: governor ? String(governor.gubernatorialActions) : "Not represented" },
      { label: "Governor orders", value: String(orders.length) },
      { label: "Governor addresses", value: String(addresses.length) },
    ],
    lists: [
      {
        heading: "Orders",
        items: withMore(
          orders.map((order) => `${order.legislationTypeId}: ${order.status}, turn ${order.issuedAtTurn}`),
        ),
      },
    ],
  };
}

function stateMyElection(world: WorldState, _viewedCountryId: string): SummaryModel {
  const home = playerHomeRegion(world);
  const mine = world.elections.filter(
    (e) =>
      e.status !== "resolved" &&
      e.state === home?.id &&
      e.candidates.some((candidate) => candidate.id === "player"),
  );
  return {
    routeId: "state.my-election",
    title: "My Election (State)",
    lede: home
      ? `The player's own live candidacies in ${home.name}.`
      : "The player's own home-region candidacies.",
    notice:
      home === null
        ? NO_HOME_REGION
        : mine.length === 0
          ? "No active candidacy for the player in this state or region."
          : null,
    facts: [
      { label: "Active candidacies", value: String(mine.length) },
      { label: "Home state or region", value: home ? `${home.name} (${home.id})` : "Not selected" },
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
  const home = playerHomeRegion(world);
  const seats = world.cabinetMembers.filter((member) => member.characterId === "player");
  const nominations = world.cabinetNominations.filter(
    (nomination) => nomination.nomineeId === "player",
  );
  const liveNominations = nominations.filter(
    (nomination) =>
      nomination.status !== "confirmed" &&
      nomination.status !== "rejected" &&
      nomination.status !== "withdrawn",
  );
  return {
    routeId: "state.my-office",
    title: "My Office (State)",
    lede: "The player's cabinet seats and nominations across their home nation.",
    notice:
      home === null
        ? NO_HOME_REGION
        : seats.length === 0 && nominations.length === 0
          ? "The player does not hold a cabinet seat and has no cabinet nomination."
          : null,
    facts: [
      { label: "Home nation", value: `${countryName(world, world.player.countryId)} (${world.player.countryId})` },
      { label: "Home state or region", value: home ? `${home.name} (${home.id})` : "Not selected" },
      { label: "Cabinet seats held", value: String(seats.length) },
      { label: "Live nominations", value: String(liveNominations.length) },
    ],
    lists: [
      {
        heading: "Seats",
        items: withMore(
          seats
            .sort((a, b) => a.positionId.localeCompare(b.positionId))
            .map(
              (seat) =>
                `${seat.positionId}: ${countryName(world, seat.countryId)}${seat.acting ? " (acting)" : ""}`,
            ),
        ),
      },
      {
        heading: "Nominations",
        items: withMore(
          nominations
            .sort((a, b) => a.id.localeCompare(b.id))
            .map(
              (nomination) =>
                `${nomination.positionId}: ${countryName(world, nomination.countryId)}, ${nomination.status}`,
            ),
        ),
      },
    ],
  };
}

function nationCabinetOffice(world: WorldState, _viewedCountryId: string): SummaryModel {
  const playerSeat = world.cabinetMembers.find((member) => member.characterId === "player");
  const officeCountryId = playerSeat?.countryId ?? world.player.countryId;
  const members = world.cabinetMembers.filter((member) => member.countryId === officeCountryId);
  const nominations = world.cabinetNominations.filter(
    (nomination) => nomination.countryId === officeCountryId,
  );
  const pending = nominations.filter((n) => n.status !== "confirmed" && n.status !== "rejected" && n.status !== "withdrawn");
  return {
    routeId: "nation.cabinet-office",
    title: "Cabinet Office",
    lede: `Cabinet seats and nominations of ${countryName(world, officeCountryId)}.`,
    notice:
      playerSeat === undefined
        ? "The player holds no cabinet seat: showing the cabinet of their home nation."
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
    case "state.my-party": return stateMyParty(world, world.player.countryId);
    case "state.overview": return stateOverview(world, world.player.countryId);
    case "state.economy": return stateEconomy(world, world.player.countryId);
    case "state.elections": return stateElections(world, world.player.countryId);
    case "state.legislature": return stateLegislature(world, world.player.countryId);
    case "state.office": return stateOffice(world, world.player.countryId);
    case "state.my-election": return stateMyElection(world, world.player.countryId);
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
