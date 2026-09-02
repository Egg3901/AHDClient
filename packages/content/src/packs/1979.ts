import type { SeedPack } from "../types.js";

/**
 * Ported from mainline AHDGame ("1979-default" preset) — real authored
 * 1979 data, no interpolation, no invented numbers.
 *
 * Source files:
 *  - src/lib/seeds/reference/budgets.ts NATIONAL_BUDGET_SEED_CONFIGS_1979
 *    (population, gdp, currencyCode, economicFactors.gdpGrowth/inflationRate)
 *  - src/lib/constants/currencies.ts INITIAL_RATES_1979 (FX, local per USD)
 *  - src/lib/world/worldEntityManifest.ts COLD_WAR_PLAYER (US/UK/RU/DD
 *    playable — same roster as 1953-default; no 1991-style contraction yet)
 *  - src/lib/constants/countries.ts COUNTRY_CONFIGS (base legislature
 *    seat counts — mainline's ERA_COUNTRY_CONFIG_OVERRIDES has ZERO entries
 *    for "1979-default": every institutional number below is the
 *    era-neutral base config, not a period override, because mainline
 *    itself has none)
 *  - src/lib/constants/historicalSeats.ts SU_SUPREME_SOVIET_1979,
 *    DD_VOLKSKAMMER_1979 (seated one-party compositions)
 *  - src/lib/seeds/uk/ukParties.ts, ru/ruParties.ts, dd/ddParties.ts,
 *    reference/politicalParties.ts (validForPresets filtered to
 *    "1979-default")
 *
 * Conversions (same method as 1953.ts):
 *  - countries[].economy.gdp: budget gdp (local currency, absolute) divided
 *    by INITIAL_RATES_1979[country] (local per USD), then by 1e6 for
 *    millions USD. US is already USD (rate 1.0).
 *  - growthRate/inflationRate: mainline's economicFactors are percent
 *    (e.g. 11.3 = 11.3%); divided by 100 to the fraction EconomySeed expects.
 *
 * Country roster: NATIONAL_BUDGET_SEED_CONFIGS_1979 authors budgets for 19
 * countries; this pack ships 18 of them. HU is EXCLUDED — mainline's
 * INITIAL_RATES_1979 has no Hungary entry (Eastern-bloc satellites besides
 * DD are not forex-active in 1979-default), so there is no non-invented way
 * to convert HU's authored Ft-denominated GDP to USD millions. Rather than
 * pick an FX rate mainline doesn't authorize, HU is omitted from this pack.
 * GENUINE GAP, documented, not fabricated.
 *
 * The 9 countries mainline's COLD_WAR_HIDDEN_1979 list keeps hidden in its
 * UI (PL, RO, YU, HU, CS, BG, UKR, BLR, BAL) are not included here at all —
 * 1953.ts carries some of them because 1953-default has no hidden list, but
 * for 1979 only the budget-authored, non-hidden set is ported.
 *
 * Unemployment: mainline's budgets.ts does not carry an unemploymentRate
 * field (only gdpGrowth/wageGrowth/inflationRate/tradeGrowth). Two figures
 * below are mainline-cited directly from era-flavor comments in
 * src/lib/seeds/{uk,de}/{uk,de}MetricPresets1979.ts (UK "high and rising
 * unemployment", DE "unemployment low (3.4%)"); DD/RU reuse the 1953 pack's
 * own planned-economy proxy (0.5%, full-employment convention, same
 * provenance as pack1953). Every other country's unemploymentRate below is
 * an EXTERNAL historical reference (standard published national annual
 * averages for 1979), NOT a mainline-authored figure — mainline has no
 * per-country 1979 unemploymentRate table for these. Documented gap.
 *
 * No states/regions/demographics table is shipped for this era: mainline's
 * states1979.ts / ukRegions1979.ts / registrationLanes1979.ts are real and
 * citable (see docs/briefs for a future wave) but porting them is deferred;
 * the engine's existing pre-W38/W39 opaque-3-region fallback seeds
 * support/electorate state for this pack instead (same fallback path
 * 1953 used before those waves landed).
 */
export const pack1979: SeedPack = {
  packVersion: 1,
  era: { id: "1979", label: "1979 Start Date - Cold War", startDate: "1979-01-01" },
  countries: [
    {
      id: "US",
      name: "United States",
      playable: true,
      economy: { gdp: 2_632_000, growthRate: 0.015, inflationRate: 0.113, unemploymentRate: 0.058 },
    },
    {
      id: "UK",
      name: "United Kingdom",
      playable: true,
      economy: { gdp: 521_277, growthRate: -0.022, inflationRate: 0.134, unemploymentRate: 0.053 },
    },
    {
      id: "RU",
      name: "Soviet Union",
      playable: true,
      economy: { gdp: 197_973, growthRate: 0.025, inflationRate: 0.01, unemploymentRate: 0.005 },
    },
    {
      id: "DD",
      name: "East Germany",
      playable: true,
      economy: { gdp: 81_081, growthRate: 0.025, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
    {
      id: "FR",
      name: "France",
      playable: false,
      economy: { gdp: 595_238, growthRate: 0.033, inflationRate: 0.108, unemploymentRate: 0.059 },
    },
    {
      id: "IT",
      name: "Italy",
      playable: false,
      economy: { gdp: 432_173, growthRate: 0.04, inflationRate: 0.148, unemploymentRate: 0.076 },
    },
    {
      id: "ES",
      name: "Spain",
      playable: false,
      economy: { gdp: 223_881, growthRate: 0.01, inflationRate: 0.157, unemploymentRate: 0.085 },
    },
    {
      id: "SE",
      name: "Sweden",
      playable: false,
      economy: { gdp: 116_550, growthRate: 0.038, inflationRate: 0.072, unemploymentRate: 0.021 },
    },
    {
      id: "TR",
      name: "Turkey",
      playable: false,
      economy: { gdp: 63_768, growthRate: -0.005, inflationRate: 0.63, unemploymentRate: 0.1 },
    },
    {
      id: "GR",
      name: "Greece",
      playable: false,
      economy: { gdp: 40_541, growthRate: 0.033, inflationRate: 0.19, unemploymentRate: 0.02 },
    },
    {
      id: "AT",
      name: "Austria",
      playable: false,
      economy: { gdp: 68_657, growthRate: 0.047, inflationRate: 0.037, unemploymentRate: 0.021 },
    },
    {
      id: "FI",
      name: "Finland",
      playable: false,
      economy: { gdp: 41_026, growthRate: 0.065, inflationRate: 0.075, unemploymentRate: 0.059 },
    },
    {
      id: "DE",
      name: "West Germany",
      playable: false,
      economy: { gdp: 1_339_744, growthRate: 0.042, inflationRate: 0.041, unemploymentRate: 0.034 },
    },
    {
      id: "JP",
      name: "Japan",
      playable: false,
      economy: { gdp: 1_050_228, growthRate: 0.053, inflationRate: 0.036, unemploymentRate: 0.021 },
    },
    {
      id: "CN",
      name: "China",
      playable: false,
      economy: { gdp: 360_645, growthRate: 0.076, inflationRate: 0.02, unemploymentRate: 0.005 },
    },
    {
      id: "BR",
      name: "Brazil",
      playable: false,
      economy: { gdp: 1_900_000, growthRate: 0.064, inflationRate: 0.772, unemploymentRate: 0.02 },
    },
    {
      id: "IE",
      name: "Ireland",
      playable: false,
      economy: { gdp: 20_000, growthRate: 0.039, inflationRate: 0.132, unemploymentRate: 0.071 },
    },
    {
      id: "NG",
      name: "Nigeria",
      playable: false,
      economy: { gdp: 38_333, growthRate: 0.055, inflationRate: 0.118, unemploymentRate: 0.03 },
    },
  ],
  parties: [
    { id: "US_DEM", name: "Democratic Party", countryId: "US", abbreviation: "DEM", color: "#3B82F6", economicPosition: -2, socialPosition: -2 },
    { id: "US_REP", name: "Republican Party", countryId: "US", abbreviation: "REP", color: "#EF4444", economicPosition: 2, socialPosition: 2 },
    // UK roster for 1979-default per ukParties.ts validForPresets: LAB/CON/SNP/PC/SF
    // are valid every preset; LD (founded 1988, but validForPresets includes
    // "1979-default" per mainline's own — anachronistic but faithfully ported,
    // see ukParties.ts comment), GRN and DUP are also valid from 1979-default.
    // LIB (1953-only) and UUP/RUK are NOT valid here.
    { id: "UK_LAB", name: "Labour Party", countryId: "UK", abbreviation: "LAB", color: "#E4003B", economicPosition: -2, socialPosition: -3 },
    { id: "UK_CON", name: "Conservative Party", countryId: "UK", abbreviation: "CON", color: "#0087DC", economicPosition: 2, socialPosition: 2 },
    { id: "UK_LD", name: "Liberal Democrats", countryId: "UK", abbreviation: "LD", color: "#FAA61A", economicPosition: 0, socialPosition: -2 },
    { id: "UK_SNP", name: "Scottish National Party", countryId: "UK", abbreviation: "SNP", color: "#FFF95D", economicPosition: -2, socialPosition: -2 },
    { id: "UK_PC", name: "Plaid Cymru", countryId: "UK", abbreviation: "PC", color: "#3F8428", economicPosition: -2, socialPosition: -2 },
    { id: "UK_GRN", name: "Green Party", countryId: "UK", abbreviation: "GRN", color: "#02A95B", economicPosition: -4, socialPosition: -4 },
    { id: "UK_DUP", name: "Democratic Unionist Party", countryId: "UK", abbreviation: "DUP", color: "#D46A4C", economicPosition: 2, socialPosition: 4 },
    { id: "UK_SF", name: "Sinn Fein", countryId: "UK", abbreviation: "SF", color: "#326760", economicPosition: -3, socialPosition: -2 },
    { id: "RU_CPSU", name: "Communist Party of the Soviet Union", countryId: "RU", abbreviation: "CPSU", color: "#CC0000", economicPosition: -4, socialPosition: 2 },
    { id: "DD_SED", name: "Sozialistische Einheitspartei Deutschlands", countryId: "DD", abbreviation: "SED", color: "#C00000", economicPosition: -4, socialPosition: 2 },
    { id: "DD_CDU", name: "Christlich-Demokratische Union (Ost)", countryId: "DD", abbreviation: "CDU", color: "#33508C", economicPosition: -3, socialPosition: 3 },
    { id: "DD_LDPD", name: "Liberal-Demokratische Partei Deutschlands", countryId: "DD", abbreviation: "LDPD", color: "#D6A300", economicPosition: -2, socialPosition: 0 },
    { id: "DD_NDPD", name: "National-Demokratische Partei Deutschlands", countryId: "DD", abbreviation: "NDPD", color: "#6E4B8B", economicPosition: -3, socialPosition: 3 },
    { id: "DD_DBD", name: "Demokratische Bauernpartei Deutschlands", countryId: "DD", abbreviation: "DBD", color: "#2E7D32", economicPosition: -3, socialPosition: 1 },
  ],
  legislatures: [
    {
      // US chamber sizes are constitutionally fixed (435 House / 100 Senate);
      // unchanged across every era. No historical seat roster exists for
      // 1979 (historicalSeats.ts has no US_HOUSE_1979/US_SENATE_1979 — the
      // file's own comment: "The multiparty players (US/UK)... start
      // vacant"), so composition is all-vacant, cited.
      countryId: "US",
      name: "Congress",
      bicameral: true,
      chambers: [
        {
          key: "senate",
          name: "Senate",
          shortName: "Senate",
          seats: 100,
          elected: true,
          description: "100 senators, six-year staggered terms. Confirms judges and cabinet.",
          composition: { seatsByParty: {}, vacancies: 100 },
        },
        {
          key: "house",
          name: "House of Representatives",
          shortName: "House",
          seats: 435,
          elected: true,
          description: "435 representatives, two-year terms. All revenue bills originate here.",
          composition: { seatsByParty: {}, vacancies: 435 },
        },
      ],
    },
    {
      // UK base COUNTRY_CONFIGS (no 1979 override exists): Commons 650,
      // Lords 784 — same as every non-1953 preset. No UK_COMMONS_1979
      // roster exists in mainline; all-vacant, cited (same reasoning as US).
      countryId: "UK",
      name: "Parliament",
      bicameral: false,
      chambers: [
        {
          key: "lords",
          name: "House of Lords",
          shortName: "Lords",
          seats: 784,
          elected: false,
          description: "Appointed and hereditary peers. Revises and scrutinises legislation.",
          composition: { seatsByParty: {}, vacancies: 784 },
        },
        {
          key: "commons",
          name: "House of Commons",
          shortName: "Commons",
          seats: 650,
          elected: true,
          description: "650 elected MPs from single-member constituencies. The primary legislative chamber.",
          composition: { seatsByParty: {}, vacancies: 650 },
        },
      ],
    },
    {
      // RU base COUNTRY_CONFIGS (no 1979 override): Soviet of the Union 559,
      // Soviet of Nationalities 515 (vs 1953-default's OVERRIDDEN 526/515).
      // historicalSeats.ts SU_SUPREME_SOVIET_1979 gives only an aggregate
      // (1,076 total: 810 CPSU / 266 independent, split "by office" across
      // supremeSovietDeputy + nationalitiesDeputy + 2 leadership seats) with
      // no exact per-chamber party breakdown, so a chamber-level composition
      // can't be derived without guessing a split — left all-vacant, cited,
      // same standard the existing 1953 pack applies to UK Commons.
      countryId: "RU",
      name: "Supreme Soviet",
      bicameral: true,
      chambers: [
        {
          key: "sovietOfNationalities",
          name: "Soviet of Nationalities",
          shortName: "Nationalities",
          seats: 515,
          elected: true,
          description: "Deputies representing the union republics and autonomous republics of the Soviet Union - the nationalities chamber of the Supreme Soviet, seated by republic rather than by population.",
          composition: { seatsByParty: {}, vacancies: 515 },
        },
        {
          key: "sovietOfTheUnion",
          name: "Soviet of the Union",
          shortName: "Union",
          seats: 559,
          elected: true,
          description: "559 deputies elected by population to the Supreme Soviet of the USSR; four-year terms, single-list elections under the Communist Party.",
          composition: { seatsByParty: {}, vacancies: 559 },
        },
      ],
    },
    {
      // DD base config, unchanged from 1953 (Volkskammer 500 / Staatsrat 25
      // — DD has no 1953-default override entry either, so these ARE the
      // base numbers). historicalSeats.ts DD_VOLKSKAMMER_1979 gives the
      // full, exact, seated National Front composition: 500 seats, 0
      // vacancies (SED 290 / CDU 52 / LDPD 52 / NDPD 52 / DBD 54).
      countryId: "DD",
      name: "Volkskammer",
      bicameral: false,
      chambers: [
        {
          key: "staatsrat",
          name: "Council of State",
          shortName: "Staatsrat",
          seats: 25,
          elected: false,
          description: "The Staatsrat - a collective head of state exercising standing authority between Volkskammer sessions.",
          composition: { seatsByParty: {}, vacancies: 25 },
        },
        {
          key: "volkskammer",
          name: "People's Chamber",
          shortName: "Volkskammer",
          seats: 500,
          elected: true,
          description: "500 deputies of the Volkskammer elected on the single National Front list, led by the ruling SED.",
          composition: { seatsByParty: { DD_SED: 290, DD_CDU: 52, DD_LDPD: 52, DD_NDPD: 52, DD_DBD: 54 }, vacancies: 0 },
        },
      ],
    },
  ],
};
