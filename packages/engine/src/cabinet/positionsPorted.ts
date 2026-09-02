import type { CabinetPosition } from "./constants.js";
/**
 * Cabinet position tables for JP/DE/IE/CN. Generated from mainline AHDGame — DO NOT HAND-EDIT.
 * Generated: 2026-09-02 by packages/content/scripts/generateRosters.ts
 * Sources:
 * - src/lib/constants/jpCabinet.ts JP_CABINET_POSITIONS
 * - src/lib/constants/deCabinet.ts DE_CABINET_POSITIONS
 * - src/lib/constants/ieCabinet.ts IE_CABINET_POSITIONS
 * - src/lib/constants/cnCabinet.ts CN_CABINET_POSITIONS
 *
 * Same {id, name, order, yearEnabled} shape as UK_CABINET_POSITIONS. Country-specific cabinet mechanics/orders (mainline *CabinetMechanics.ts) are PORT-STUB; positions fill via the parliamentary path.
 */
export const JP_CABINET_POSITIONS: readonly CabinetPosition[] = [
  { id: "chief_cabinet_secretary", name: "Chief Cabinet Secretary", order: 1, yearEnabled: 1775 },
  { id: "finance_minister", name: "Minister of Finance", order: 2, yearEnabled: 1775 },
  { id: "foreign_affairs_minister", name: "Minister of Foreign Affairs", order: 3, yearEnabled: 1775 },
  { id: "justice_minister", name: "Minister of Justice", order: 4, yearEnabled: 1775 },
  { id: "defense_minister", name: "Minister of Defense", order: 5, yearEnabled: 1775 },
  { id: "economy_minister", name: "Minister of Economy, Trade and Industry", order: 6, yearEnabled: 1775 },
  { id: "health_minister", name: "Minister of Health, Labour and Welfare", order: 7, yearEnabled: 1775 },
  { id: "education_minister", name: "Minister of Education, Culture, Sports, Science and Technology", order: 8, yearEnabled: 1775 },
  { id: "land_minister", name: "Minister of Land, Infrastructure, Transport and Tourism", order: 9, yearEnabled: 1775 },
  { id: "environment_minister", name: "Minister of the Environment", order: 10, yearEnabled: 1775 },
  { id: "internal_affairs_minister", name: "Minister of Internal Affairs and Communications", order: 11, yearEnabled: 1775 },
];

export const DE_CABINET_POSITIONS: readonly CabinetPosition[] = [
  { id: "finance_minister", name: "Federal Minister of Finance", order: 1, yearEnabled: 1775 },
  { id: "foreign_minister", name: "Federal Minister for Foreign Affairs", order: 2, yearEnabled: 1775 },
  { id: "interior_minister", name: "Federal Minister of the Interior", order: 3, yearEnabled: 1775 },
  { id: "defense_minister", name: "Federal Minister of Defence", order: 4, yearEnabled: 1775 },
  { id: "justice_minister", name: "Federal Minister of Justice", order: 5, yearEnabled: 1775 },
  { id: "economy_minister", name: "Federal Minister for Economic Affairs", order: 6, yearEnabled: 1775 },
  { id: "labour_minister", name: "Federal Minister of Labour and Social Affairs", order: 7, yearEnabled: 1775 },
  { id: "health_minister", name: "Federal Minister of Health", order: 8, yearEnabled: 1775 },
  { id: "transport_minister", name: "Federal Minister for Transport", order: 9, yearEnabled: 1775 },
  { id: "education_minister", name: "Federal Minister of Education and Research", order: 10, yearEnabled: 1775 },
  { id: "environment_minister", name: "Federal Minister for the Environment", order: 11, yearEnabled: 1775 },
];

export const IE_CABINET_POSITIONS: readonly CabinetPosition[] = [
  { id: "taoiseach", name: "Taoiseach", order: 0, yearEnabled: 1775 },
  { id: "tanaiste", name: "Tánaiste", order: 1, yearEnabled: 1775 },
  { id: "minister_for_finance", name: "Minister for Finance", order: 2, yearEnabled: 1775 },
  { id: "minister_for_public_expenditure", name: "Minister for Public Expenditure, NDP Delivery and Reform", order: 3, yearEnabled: 1775 },
  { id: "minister_for_foreign_affairs", name: "Minister for Foreign Affairs", order: 4, yearEnabled: 1775 },
  { id: "minister_for_enterprise", name: "Minister for Enterprise, Trade and Employment", order: 5, yearEnabled: 1775 },
  { id: "minister_for_health", name: "Minister for Health", order: 6, yearEnabled: 1775 },
  { id: "minister_for_education", name: "Minister for Education", order: 7, yearEnabled: 1775 },
  { id: "minister_for_further_higher_education", name: "Minister for Further and Higher Education, Research, Innovation and Science", order: 8, yearEnabled: 1775 },
  { id: "minister_for_housing", name: "Minister for Housing, Local Government and Heritage", order: 9, yearEnabled: 1775 },
  { id: "minister_for_social_protection", name: "Minister for Social Protection", order: 10, yearEnabled: 1775 },
  { id: "minister_for_justice", name: "Minister for Justice", order: 11, yearEnabled: 1775 },
  { id: "minister_for_defence", name: "Minister for Defence", order: 12, yearEnabled: 1775 },
  { id: "minister_for_environment_climate", name: "Minister for the Environment, Climate and Communications", order: 13, yearEnabled: 1775 },
  { id: "minister_for_agriculture", name: "Minister for Agriculture, Food and the Marine", order: 14, yearEnabled: 1775 },
  { id: "minister_for_transport", name: "Minister for Transport", order: 15, yearEnabled: 1775 },
  { id: "minister_for_tourism_culture", name: "Minister for Tourism, Culture, Arts, Gaeltacht, Sport and Media", order: 16, yearEnabled: 1775 },
  { id: "minister_for_children", name: "Minister for Children, Equality, Disability, Integration and Youth", order: 17, yearEnabled: 1775 },
  { id: "minister_for_rural_community", name: "Minister for Rural and Community Development", order: 18, yearEnabled: 1775 },
];

export const CN_CABINET_POSITIONS: readonly CabinetPosition[] = [
  { id: "premier", name: "Premier of the State Council", order: 0, yearEnabled: 1775 },
  { id: "vice_premier", name: "Vice Premier", order: 1, yearEnabled: 1775 },
  { id: "state_councillor", name: "State Councillor", order: 2, yearEnabled: 1775 },
  { id: "minister_of_foreign_affairs", name: "Minister of Foreign Affairs", order: 3, yearEnabled: 1775 },
  { id: "minister_of_finance", name: "Minister of Finance", order: 4, yearEnabled: 1775 },
  { id: "minister_of_defense", name: "Chairman of the Central Military Commission", order: 5, yearEnabled: 1775 },
  { id: "minister_of_education", name: "Minister of Education", order: 6, yearEnabled: 1775 },
  { id: "minister_of_health", name: "Minister of Health", order: 7, yearEnabled: 1775 },
  { id: "pboc_governor", name: "State Council Liaison to the PBoC", order: 8, yearEnabled: 1775 },
  { id: "minister_of_public_security", name: "Minister of Public Security", order: 9, yearEnabled: 1775 },
  { id: "minister_of_commerce", name: "Minister of Commerce", order: 10, yearEnabled: 1775 },
  { id: "minister_of_human_resources_social_security", name: "Minister of Human Resources and Social Security", order: 11, yearEnabled: 1775 },
  { id: "minister_of_ecology_environment", name: "Minister of Ecology and Environment", order: 12, yearEnabled: 1775 },
  { id: "minister_of_transport", name: "Minister of Transport", order: 13, yearEnabled: 1775 },
  { id: "minister_of_agriculture_rural_affairs", name: "Minister of Agriculture and Rural Affairs", order: 14, yearEnabled: 1775 },
  { id: "minister_of_housing_urban_rural", name: "Minister of Housing and Urban-Rural Development", order: 15, yearEnabled: 1775 },
];
