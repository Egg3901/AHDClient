import type { SeedPack } from "../types.js";

/**
 * Generated from mainline AHDGame  -  DO NOT HAND-EDIT.
 * Source files: src/lib/seeds/reference/budgets.ts (NATIONAL_BUDGET_SEED_CONFIGS_1953 and _1979 for lerp), src/lib/seeds/eraInterpolation.ts (ERA_ANCHOR_YEARS, resolveEraBlend, lerpNumericTree), src/lib/constants/currencies.ts (INITIAL_RATES_1953 for GDP conversion), src/lib/seeds/reference/gdpDenomination.ts, src/lib/world/worldEntityManifest.ts (COLD_WAR_PLAYER), src/lib/constants/countries.ts (COUNTRY_CONFIGS + ERA_COUNTRY_CONFIG_OVERRIDES), src/lib/seeds/reference/politicalParties.ts, src/lib/seeds/uk/ukParties.ts, src/lib/seeds/ru/ruParties.ts, src/lib/seeds/dd/ddParties.ts, src/lib/constants/historicalSeats.ts (1953 rosters reused)
 * Generated: 2026-09-01
 * See packages/content/scripts/generatePacks.ts for conversion notes.
 */
/**
 * 1960 is NOT an authored EraId in mainline (see presetSelector.ts EraId = 1953|1979|...; eraInterpolation.ts ERA_ANCHOR_YEARS).
 * No 1960 budget anchors exist. Values are derived per the brief's era-scale instruction:
 *  - growthRate/inflationRate: lerp between NATIONAL_BUDGET_SEED_CONFIGS_1953 and _1979 economicFactors via eraInterpolation.ts logic
 *    t = (1960-1953)/(1979-1953) = 7/26 applied to each country's gdpGrowth and inflationRate; countries without a 1979 peer clamp to 1953.
 *  - gdp: 1953 USD GDP (converted as in 1953 pack) compounded at 1953 gdpGrowth for 7 years (real growth only).
 *    This is a projection, not a historical nominal anchor  -  mainline has no 1960 nominal GDP table.
 *  - unemploymentRate: no 1979 peer table; reused from 1953 (same provenance as 1953 pack).
 * Playable set identical to 1953 (worldEntityManifest.ts COLD_WAR_PLAYER for 1953-default; 1960 is within that era's range).
 *
 * Parties for 1960:
 *  Mainline has no 1960-specific party roster. validForPresets for the 1960 window is unaddressed: the only
 *  anchors are 1953-default and 1979-default. The six 1953-filtered UK parties (LAB, CON, LIB, SNP, PC, SF) are
 *  correct for 1960 because Liberal Democrats (1988), Greens (1990), DUP (1971), Reform (2019) and UUP (1991) all
 *  postdate 1960; the same holds for US (DEM, REP unchanged), RU (CPSU alone) and DD (SED + four bloc parties).
 *  So 1960 reuses the 1953 playable roster verbatim. Cited: ukParties.ts validForPresets and party founding dates.
 *  No numbers invented; reuse is documented.
 *
 * Legislatures for 1960:
 *  Mainline has no 1960 chamber-size override. The only legislated sizes are COUNTRY_CONFIGS (modern) and
 *  ERA_COUNTRY_CONFIG_OVERRIDES 1953-default (UK 625 vs modern 650, RU 526 vs 559). Since 1960 is prior to the
 *  1961 UK Senate creation and the 1955 UK Commons redistribution to 630 is also not in mainline's ERA table,
 *  we carry forward the 1953-configured sizes (UK 625, RU 526/515, US 100/435, DD 500/25/80) rather than switch
 *  to modern 650/559. Compositions reuse 1953 HistoricalSeat allocations for the same reason: mainline has no
 *  1960 HistoricalSeat roster (only 1953, 1979, 2020). The next HistoricalSeats are the 1979 one-party tables.
 *  Vacancy semantics unchanged. Sources: countries.ts ERA_COUNTRY_CONFIG_OVERRIDES, historicalSeats.ts.
 */
export const pack1960: SeedPack = {
  packVersion: 1,
  era: { id: "1960", label: "1960: Brink of Change", startDate: "1960-01-05" },
  countries: [
    {
      id: "US",
      name: "United States",
      playable: true,
      economy: { gdp: 530191, growthRate: 0.03765, inflationRate: 0.0359, unemploymentRate: 0.029 },
    },
    {
      id: "UK",
      name: "United Kingdom",
      playable: true,
      economy: { gdp: 53080, growthRate: 0.02331, inflationRate: 0.058, unemploymentRate: 0.018 },
    },
    {
      id: "RU",
      name: "Soviet Union",
      playable: true,
      economy: { gdp: 166345, growthRate: 0.04692, inflationRate: 0.00635, unemploymentRate: 0.005 },
    },
    {
      id: "FR",
      name: "France",
      playable: false,
      economy: { gdp: 59797, growthRate: 0.03446, inflationRate: 0.04735, unemploymentRate: 0.02 },
    },
    {
      id: "IT",
      name: "Italy",
      playable: false,
      economy: { gdp: 26418, growthRate: 0.05827, inflationRate: 0.05812, unemploymentRate: 0.08 },
    },
    {
      id: "ES",
      name: "Spain",
      playable: false,
      economy: { gdp: 5743, growthRate: 0.01731, inflationRate: 0.0715, unemploymentRate: 0.045 },
    },
    {
      id: "SE",
      name: "Sweden",
      playable: false,
      economy: { gdp: 8859, growthRate: 0.03581, inflationRate: 0.03765, unemploymentRate: 0.025 },
    },
    {
      id: "TR",
      name: "Turkey",
      playable: false,
      economy: { gdp: 16179, growthRate: 0.06808, inflationRate: 0.2025, unemploymentRate: 0.05 },
    },
    {
      id: "GR",
      name: "Greece",
      playable: false,
      economy: { gdp: 2676, growthRate: 0.06004, inflationRate: 0.11692, unemploymentRate: 0.06 },
    },
    {
      id: "AT",
      name: "Austria",
      playable: false,
      economy: { gdp: 4021, growthRate: 0.03458, inflationRate: 0.02458, unemploymentRate: 0.045 },
    },
    {
      id: "FI",
      name: "Finland",
      playable: false,
      economy: { gdp: 3683, growthRate: 0.02481, inflationRate: 0.03481, unemploymentRate: 0.03 },
    },
    {
      id: "DE",
      name: "West Germany",
      playable: false,
      economy: { gdp: 58162, growthRate: 0.07342, inflationRate: 0.00958, unemploymentRate: 0.084 },
    },
    {
      id: "JP",
      name: "Japan",
      playable: false,
      economy: { gdp: 47163, growthRate: 0.08004, inflationRate: 0.05719, unemploymentRate: 0.02 },
    },
    {
      id: "CN",
      name: "China",
      playable: false,
      economy: { gdp: 88579, growthRate: 0.13008, inflationRate: 0.03096, unemploymentRate: 0.045 },
    },
    {
      id: "BR",
      name: "Brazil",
      playable: false,
      economy: { gdp: 23887, growthRate: 0.05012, inflationRate: 0.26631, unemploymentRate: 0.05 },
    },
    {
      id: "IE",
      name: "Ireland",
      playable: false,
      economy: { gdp: 1057, growthRate: 0.02146, inflationRate: 0.05381, unemploymentRate: 0.05 },
    },
    {
      id: "NG",
      name: "Nigeria",
      playable: false,
      economy: { gdp: 4326, growthRate: 0.04038, inflationRate: 0.05369, unemploymentRate: 0.03 },
    },
    {
      id: "DD",
      name: "East Germany",
      playable: true,
      economy: { gdp: 14641, growthRate: 0.02865, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
    {
      id: "HU",
      name: "Hungary",
      playable: false,
      economy: { gdp: 6361, growthRate: 0.03365, inflationRate: 0.03269, unemploymentRate: 0.005 },
    },
    {
      id: "PL",
      name: "Poland",
      playable: false,
      economy: { gdp: 16449, growthRate: 0.04, inflationRate: 0.02, unemploymentRate: 0.005 },
    },
    {
      id: "RO",
      name: "Romania",
      playable: false,
      economy: { gdp: 7539, growthRate: 0.035, inflationRate: 0.02, unemploymentRate: 0.005 },
    },
    {
      id: "YU",
      name: "Yugoslavia",
      playable: false,
      economy: { gdp: 8442, growthRate: 0.05, inflationRate: 0.05, unemploymentRate: 0.01 },
    },
    {
      id: "BG",
      name: "Bulgaria",
      playable: false,
      economy: { gdp: 3440, growthRate: 0.04, inflationRate: 0.015, unemploymentRate: 0.005 },
    },
    {
      id: "BLR",
      name: "Belarus",
      playable: false,
      economy: { gdp: 7817, growthRate: 0.05, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
    {
      id: "UKR",
      name: "Ukraine",
      playable: false,
      economy: { gdp: 47142, growthRate: 0.055, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
    {
      id: "CS",
      name: "Czechoslovakia",
      playable: false,
      economy: { gdp: 10080, growthRate: 0.045, inflationRate: 0.015, unemploymentRate: 0.005 },
    },
    {
      id: "BAL",
      name: "Baltic Republics",
      playable: false,
      economy: { gdp: 4410, growthRate: 0.045, inflationRate: 0.005, unemploymentRate: 0.005 },
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
