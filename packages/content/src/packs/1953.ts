import type { SeedPack } from "../types.js";

/**
 * Generated from mainline AHDGame  -  DO NOT HAND-EDIT.
 * Source files: src/lib/seeds/reference/budgets.ts (NATIONAL_BUDGET_SEED_CONFIGS_1953 + makeEasternBlocBudget1953), src/lib/seeds/reference/gdpDenomination.ts (GDP_DENOMINATION_1953), src/lib/constants/currencies.ts (INITIAL_RATES_1953), src/lib/constants/countries.ts (COUNTRY_CONFIGS names + ERA_COUNTRY_CONFIG_OVERRIDES for 1953-default), src/lib/world/worldEntityManifest.ts (COLD_WAR_PLAYER), src/lib/seeds/[country]/[country]MetricPresets1953.ts and ddStateMetrics1953.ts (unemployment where authored), src/lib/seeds/reference/stateMetrics1953.ts (UNEMP_1953 comment for US), src/lib/seeds/reference/politicalParties.ts (US parties), src/lib/seeds/uk/ukParties.ts (UK parties, filtered via validForPresets), src/lib/seeds/ru/ruParties.ts (RU CPSU), src/lib/seeds/dd/ddParties.ts (DD National Front), src/lib/constants/historicalSeats.ts (US_HOUSE_1953 / US_SENATE_1953 / SU_SUPREME_SOVIET_1953 / DD_VOLKSKAMMER_1953)
 * Generated: 2026-09-01
 * See packages/content/scripts/generatePacks.ts for conversion notes.
 */
/**
 * Conversions:
 *  - gdp: mainline stores GDP in local currency (or USD-anchored for IT/JP/CN/NG per gdpDenomination.ts).
 *    Converted to millions USD via INITIAL_RATES_1953 (currencies.ts). USD-anchored values divided by 1e6 only.
 *  - growthRate/inflationRate: mainline stores as percent (e.g. 4.6 = 4.6%). Divided by 100 to fractions as EconomySeed expects.
 *  - unemploymentRate: where NATIONAL_1953 carries economic.unemploymentRate (FR/IT/ES/SE/TR/GR/AT/FI/CN and DD baseline 0.5), used directly.
 *    Otherwise: US 2.9 via stateMetrics1953.ts UNEMP_1953/BLS; UK 1.8 historical; DE 8.4 Statistisches Bundesamt;
 *    JP 2.0 historical; IE/BR/NG via matchingFriction proxy; RU and eastern-bloc satellites at planned 0.5 (DD proxy, YU 1.0 self-management).
 * Playable: worldEntityManifest.ts COLD_WAR_PLAYER = US/UK/RU/DD for 1953-default; rest economy-preview/hidden.
 * Ids: kept as mainline CountryId values (uppercase, e.g. US not us) for cross-repo alignment.
 *
 * Parties:
 *  - US: reference/politicalParties.ts politicalParties (DEM, REP)  -  economicPosition/socialPosition -2/-2 and 2/2.
 *  - UK: uk/ukParties.ts filtered to validForPresets includes "1953-default"  -  LAB, CON, SNP, PC, SF, LIB (6). LD/GRN/RUK/DUP/UUP gated to 1979+/2019+ via validForPresets.
 *  - RU: ru/ruParties.ts  -  CPSU alone, -4/2, regimeStatus ruling.
 *  - DD: dd/ddParties.ts  -  SED (-4/2 ruling) plus approved bloc CDU (-3/3), LDPD (-2/0), NDPD (-3/3), DBD (-3/1), all validForPresets 1953-default.
 *  Party ids are namespaced as <COUNTRY>_<ABBR> (e.g. US_DEM, UK_LAB, RU_CPSU, DD_SED) to keep the Record<partyId, number> namespace collision-free.
 *
 * Legislatures:
 *  - Chamber names, seats, elected flag, bicameral, description from COUNTRY_CONFIGS and ERA_COUNTRY_CONFIG_OVERRIDES via getCountryConfig(id, "1953-default").
 *    UK lower 625 (override) vs base 650, RU lower 526 (override) vs base 559, DD lower 500, Staatsrat 25 (elected false).
 *  - Compositions ported from src/lib/constants/historicalSeats.ts:
 *    US House 435: 213 DEM / 221 REP / 1 independent (Reams)  -> seatsByParty US_DEM 213, US_REP 221, vacancies 1 (independent).
 *    US Senate 96 seated + 4 AK/HI vacancies = 100: 47 DEM / 48 REP / 1 IND (Morse) -> US_DEM 47, US_REP 48, vacancies 5.
 *    RU Soviet of Union 526: CPSU 398 / non-party 128 -> RU_CPSU 398, vacancies 128.
 *    RU Soviet of Nationalities 515: CPSU 388 / non-party 127 -> RU_CPSU 388, vacancies 127.
 *    DD Volkskammer 500: SED 292, CDU 51, LDPD 51, NDPD 51, DBD 55 -> respective DD_* ids, vacancies 0.
 *    UK Commons 625, RU/UK/DD subnational and appointed uppers have no HistoricalSeat roster in mainline for 1953 (RESET_PRESETS: "One-party legislatures start seated; democracies start vacant") so they are stored as all vacancies.
 *    Sources: historicalSeats.ts US_HOUSE_1953 / US_SENATE_1953 / SU_SUPREME_SOVIET_1953 / DD_VOLKSKAMMER_1953 and countries.ts ERA_COUNTRY_CONFIG_OVERRIDES.
 */
export const pack1953: SeedPack = {
  packVersion: 1,
  era: { id: "1953", label: "1953: Cold War Dawn", startDate: "1953-01-06" },
  countries: [
    {
      id: "US",
      name: "United States",
      playable: true,
      economy: { gdp: 387000, growthRate: 0.046, inflationRate: 0.0075, unemploymentRate: 0.029 },
    },
    {
      id: "UK",
      name: "United Kingdom",
      playable: true,
      economy: { gdp: 40336, growthRate: 0.04, inflationRate: 0.03, unemploymentRate: 0.018 },
    },
    {
      id: "RU",
      name: "Soviet Union",
      playable: true,
      economy: { gdp: 114352, growthRate: 0.055, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
    {
      id: "FR",
      name: "France",
      playable: false,
      economy: { gdp: 47000, growthRate: 0.035, inflationRate: 0.025, unemploymentRate: 0.02 },
    },
    {
      id: "IT",
      name: "Italy",
      playable: false,
      economy: { gdp: 17000, growthRate: 0.065, inflationRate: 0.025, unemploymentRate: 0.08 },
    },
    {
      id: "ES",
      name: "Spain",
      playable: false,
      economy: { gdp: 5000, growthRate: 0.02, inflationRate: 0.04, unemploymentRate: 0.045 },
    },
    {
      id: "SE",
      name: "Sweden",
      playable: false,
      economy: { gdp: 6963, growthRate: 0.035, inflationRate: 0.025, unemploymentRate: 0.025 },
    },
    {
      id: "TR",
      name: "Turkey",
      playable: false,
      economy: { gdp: 8571, growthRate: 0.095, inflationRate: 0.045, unemploymentRate: 0.05 },
    },
    {
      id: "GR",
      name: "Greece",
      playable: false,
      economy: { gdp: 1667, growthRate: 0.07, inflationRate: 0.09, unemploymentRate: 0.06 },
    },
    {
      id: "AT",
      name: "Austria",
      playable: false,
      economy: { gdp: 3269, growthRate: 0.03, inflationRate: 0.02, unemploymentRate: 0.045 },
    },
    {
      id: "FI",
      name: "Finland",
      playable: false,
      economy: { gdp: 3435, growthRate: 0.01, inflationRate: 0.02, unemploymentRate: 0.03 },
    },
    {
      id: "DE",
      name: "West Germany",
      playable: false,
      economy: { gdp: 32857, growthRate: 0.085, inflationRate: -0.002, unemploymentRate: 0.084 },
    },
    {
      id: "JP",
      name: "Japan",
      playable: false,
      economy: { gdp: 25800, growthRate: 0.09, inflationRate: 0.065, unemploymentRate: 0.02 },
    },
    {
      id: "CN",
      name: "China",
      playable: false,
      economy: { gdp: 33300, growthRate: 0.15, inflationRate: 0.035, unemploymentRate: 0.045 },
    },
    {
      id: "BR",
      name: "Brazil",
      playable: false,
      economy: { gdp: 17553, growthRate: 0.045, inflationRate: 0.08, unemploymentRate: 0.05 },
    },
    {
      id: "IE",
      name: "Ireland",
      playable: false,
      economy: { gdp: 952, growthRate: 0.015, inflationRate: 0.025, unemploymentRate: 0.05 },
    },
    {
      id: "NG",
      name: "Nigeria",
      playable: false,
      economy: { gdp: 3400, growthRate: 0.035, inflationRate: 0.03, unemploymentRate: 0.03 },
    },
    {
      id: "DD",
      name: "East Germany",
      playable: true,
      economy: { gdp: 11905, growthRate: 0.03, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
    {
      id: "HU",
      name: "Hungary",
      playable: false,
      economy: { gdp: 5000, growthRate: 0.035, inflationRate: 0.03, unemploymentRate: 0.005 },
    },
    {
      id: "PL",
      name: "Poland",
      playable: false,
      economy: { gdp: 12500, growthRate: 0.04, inflationRate: 0.02, unemploymentRate: 0.005 },
    },
    {
      id: "RO",
      name: "Romania",
      playable: false,
      economy: { gdp: 5926, growthRate: 0.035, inflationRate: 0.02, unemploymentRate: 0.005 },
    },
    {
      id: "YU",
      name: "Yugoslavia",
      playable: false,
      economy: { gdp: 6000, growthRate: 0.05, inflationRate: 0.05, unemploymentRate: 0.01 },
    },
    {
      id: "BG",
      name: "Bulgaria",
      playable: false,
      economy: { gdp: 2614, growthRate: 0.04, inflationRate: 0.015, unemploymentRate: 0.005 },
    },
    {
      id: "BLR",
      name: "Belarus",
      playable: false,
      economy: { gdp: 5556, growthRate: 0.05, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
    {
      id: "UKR",
      name: "Ukraine",
      playable: false,
      economy: { gdp: 32407, growthRate: 0.055, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
    {
      id: "CS",
      name: "Czechoslovakia",
      playable: false,
      economy: { gdp: 7407, growthRate: 0.045, inflationRate: 0.015, unemploymentRate: 0.005 },
    },
    {
      id: "BAL",
      name: "Baltic Republics",
      playable: false,
      economy: { gdp: 3241, growthRate: 0.045, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
  ],
  parties: [
    { id: "US_DEM", name: "Democratic Party", countryId: "US", abbreviation: "DEM", color: "#3B82F6", economicPosition: -2, socialPosition: -2 },
    { id: "US_REP", name: "Republican Party", countryId: "US", abbreviation: "REP", color: "#EF4444", economicPosition: 2, socialPosition: 2 },
    { id: "UK_LAB", name: "Labour Party", countryId: "UK", abbreviation: "LAB", color: "#E4003B", economicPosition: -2, socialPosition: -3 },
    { id: "UK_CON", name: "Conservative Party", countryId: "UK", abbreviation: "CON", color: "#0087DC", economicPosition: 2, socialPosition: 2 },
    { id: "UK_LIB", name: "Liberal Party", countryId: "UK", abbreviation: "LIB", color: "#FDBB30", economicPosition: 0, socialPosition: -1 },
    { id: "UK_SNP", name: "Scottish National Party", countryId: "UK", abbreviation: "SNP", color: "#FFF95D", economicPosition: -2, socialPosition: -2 },
    { id: "UK_PC", name: "Plaid Cymru", countryId: "UK", abbreviation: "PC", color: "#3F8428", economicPosition: -2, socialPosition: -2 },
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
          composition: { seatsByParty: { US_DEM: 47, US_REP: 48 }, vacancies: 5 },
        },
        {
          key: "house",
          name: "House of Representatives",
          shortName: "House",
          seats: 435,
          elected: true,
          description: "435 representatives, two-year terms. All revenue bills originate here.",
          composition: { seatsByParty: { US_DEM: 213, US_REP: 221 }, vacancies: 1 },
        },
        {
          key: "stateSenate",
          name: "State Senate",
          shortName: "State Senate",
          seats: 1972,
          elected: true,
          description: "Each state's elected legislature, which sets state law and budgets.",
          composition: { seatsByParty: {}, vacancies: 1972 },
        },
      ],
    },
    {
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
          seats: 625,
          elected: true,
          description: "625 elected MPs from single-member constituencies (1950-1955 redistribution). The primary legislative chamber.",
          composition: { seatsByParty: {}, vacancies: 625 },
        },
        {
          key: "regionalCouncil",
          name: "Regional Council",
          shortName: "Regional Council",
          seats: 364,
          elected: true,
          description: "Elected regional councillors representing UK nations and regions on staggered five-year terms.",
          composition: { seatsByParty: {}, vacancies: 364 },
        },
      ],
    },
    {
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
          composition: { seatsByParty: { RU_CPSU: 388 }, vacancies: 127 },
        },
        {
          key: "sovietOfTheUnion",
          name: "Soviet of the Union",
          shortName: "Union",
          seats: 526,
          elected: true,
          description: "526 deputies elected by population to the Supreme Soviet of the USSR; four-year terms, single-list elections under the Communist Party.",
          composition: { seatsByParty: { RU_CPSU: 398 }, vacancies: 128 },
        },
        {
          key: "republicSupremeSoviet",
          name: "Republic Supreme Soviet",
          shortName: "Republic Soviet",
          seats: 5000,
          elected: true,
          description: "The Supreme Soviets of the union republics and the regional Soviets of People's Deputies - the legislative arm of each republic government. Four-year terms.",
          composition: { seatsByParty: {}, vacancies: 5000 },
        },
      ],
    },
    {
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
          composition: { seatsByParty: { DD_SED: 292, DD_CDU: 51, DD_LDPD: 51, DD_NDPD: 51, DD_DBD: 55 }, vacancies: 0 },
        },
        {
          key: "landAssembly",
          name: "Landtag",
          shortName: "Landtag",
          seats: 80,
          elected: true,
          description: "The Landtage of the GDR's eastern Laender - the legislative arm of each Land government under the SED First Secretary. Four-year terms on the Volkskammer cycle.",
          composition: { seatsByParty: {}, vacancies: 80 },
        },
      ],
    },
  ],
};
