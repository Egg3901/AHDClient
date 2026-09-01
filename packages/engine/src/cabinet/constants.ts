/**
 * Cabinet position constants — W29 port.
 *
 * US positions: src/lib/constants/cabinet.ts CABINET_POSITIONS (15 officers, yearEnabled gating)
 * UK positions: src/lib/constants/ukCabinet.ts UK_CABINET_POSITIONS
 * Other countries (JP/DE/IE/CN/NG): src/lib/constants/jpCabinet.ts etc. — PORT-STUB with minimal roster.
 *
 * Solo copies the position ids verbatim so branch constants and test goldens cite the same keys.
 */

export interface CabinetPosition {
  id: string;
  name: string;
  order: number;
  yearEnabled?: number;
}

export const US_CABINET_POSITIONS: readonly CabinetPosition[] = [
  { id: "secretary_of_state", name: "Secretary of State", order: 1, yearEnabled: 1775 },
  { id: "secretary_of_treasury", name: "Secretary of the Treasury", order: 2, yearEnabled: 1775 },
  { id: "secretary_of_defense", name: "Secretary of Defense", order: 3, yearEnabled: 1775 },
  { id: "attorney_general", name: "Attorney General", order: 4, yearEnabled: 1775 },
  { id: "secretary_of_interior", name: "Secretary of the Interior", order: 5, yearEnabled: 1775 },
  { id: "secretary_of_agriculture", name: "Secretary of Agriculture", order: 6, yearEnabled: 1775 },
  { id: "secretary_of_commerce", name: "Secretary of Commerce", order: 7, yearEnabled: 1775 },
  { id: "secretary_of_labor", name: "Secretary of Labor", order: 8, yearEnabled: 1775 },
  { id: "secretary_of_health", name: "Secretary of Health and Human Services", order: 9, yearEnabled: 1953 },
  { id: "secretary_of_hud", name: "Secretary of Housing and Urban Development", order: 10, yearEnabled: 1965 },
  { id: "secretary_of_transportation", name: "Secretary of Transportation", order: 11, yearEnabled: 1967 },
  { id: "secretary_of_energy", name: "Secretary of Energy", order: 12, yearEnabled: 1977 },
  { id: "secretary_of_education", name: "Secretary of Education", order: 13, yearEnabled: 1979 },
  { id: "secretary_of_veterans_affairs", name: "Secretary of Veterans Affairs", order: 14, yearEnabled: 1989 },
  { id: "secretary_of_homeland_security", name: "Secretary of Homeland Security", order: 15, yearEnabled: 2002 },
  // VP is also routed through cabinetNominationLifecycle (25th Amendment, both chambers)
  { id: "vicePresident", name: "Vice President", order: 0, yearEnabled: 1775 },
] as const;

export const UK_CABINET_POSITIONS: readonly CabinetPosition[] = [
  { id: "deputy_prime_minister", name: "Deputy Prime Minister", order: 0, yearEnabled: 1775 },
  { id: "first_secretary_of_state", name: "First Secretary of State", order: 1, yearEnabled: 1962 },
  { id: "chancellor", name: "Chancellor of the Exchequer", order: 2, yearEnabled: 1775 },
  { id: "foreign_secretary", name: "Foreign Secretary", order: 3, yearEnabled: 1775 },
  { id: "home_secretary", name: "Home Secretary", order: 4, yearEnabled: 1775 },
  { id: "defence_secretary", name: "Secretary of State for Defence", order: 5, yearEnabled: 1775 },
  { id: "justice_secretary", name: "Lord Chancellor", order: 6, yearEnabled: 1775 },
  { id: "health_secretary", name: "Secretary of State for Health and Social Care", order: 7, yearEnabled: 1775 },
  { id: "education_secretary", name: "Secretary of State for Education", order: 8, yearEnabled: 1775 },
  { id: "business_secretary", name: "Secretary of State for Business", order: 9, yearEnabled: 1775 },
  { id: "levelling_secretary", name: "Secretary for Levelling Up", order: 10, yearEnabled: 1775 },
  { id: "environment_secretary", name: "Secretary of State for Environment", order: 11, yearEnabled: 1775 },
  { id: "transport_secretary", name: "Secretary of State for Transport", order: 12, yearEnabled: 1775 },
  { id: "culture_secretary", name: "Secretary of State for Culture", order: 13, yearEnabled: 1775 },
  { id: "work_pensions_secretary", name: "Secretary of State for Work and Pensions", order: 14, yearEnabled: 1775 },
] as const;

// PORT-STUB: non-US/UK cabinets modelled as opaque lists — exact yearEnabled/name shapes
// are deferred until those countries' legislature/cabinet systems are fully ported.
export const CABINET_POSITIONS_BY_COUNTRY: Record<string, readonly CabinetPosition[]> = {
  US: US_CABINET_POSITIONS,
  UK: UK_CABINET_POSITIONS,
};

export function cabinetPositionsForCountry(countryId: string): readonly CabinetPosition[] {
  return CABINET_POSITIONS_BY_COUNTRY[countryId] ?? [];
}

export function getCabinetPositionName(positionId: string): string {
  for (const list of Object.values(CABINET_POSITIONS_BY_COUNTRY)) {
    const found = list.find((p) => p.id === positionId);
    if (found) return found.name;
  }
  return positionId;
}
