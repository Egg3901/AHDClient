/**
 * Fiscal year calendar and rollover.
 * Sources:
 *  - src/lib/constants/turnTime.ts TURNS_PER_YEAR=48
 *  - src/lib/countrySystems/fiscalCalendar.ts getTurnInYear, getSharedFiscalYearStartTurnInYear (=40)
 *  - src/lib/budget/fiscalYear.ts isFiscalYearEnd, calculateFiscalYear, processFiscalYear (annual reconciliation subset)
 */

// Source: src/lib/constants/turnTime.ts TURNS_PER_YEAR
export const TURNS_PER_YEAR = 48;

// Source: src/lib/countrySystems/fiscalCalendar.ts — shared start is 40 for all registered countries (see countries.ts fiscalYearStartTurnInYear)
export const FISCAL_YEAR_START_TURN_IN_YEAR = 40;

/**
 * Turn within its 48-turn year: 1..48.
 * Source: src/lib/countrySystems/fiscalCalendar.ts getTurnInYear
 */
export function getTurnInYear(currentTurn: number): number {
  return ((currentTurn - 1) % TURNS_PER_YEAR) + 1;
}

/**
 * True when this turn is the fiscal-year boundary (turn 40).
 * Source: src/lib/budget/fiscalYear.ts isFiscalYearEnd
 */
export function isFiscalYearEnd(currentTurn: number): boolean {
  return getTurnInYear(currentTurn) === FISCAL_YEAR_START_TURN_IN_YEAR;
}

/**
 * Fiscal year for a given calendar year and turn.
 * Source: src/lib/budget/fiscalYear.ts calculateFiscalYear
 */
export function calculateFiscalYear(currentYear: number, currentTurn: number): number {
  return getTurnInYear(currentTurn) >= FISCAL_YEAR_START_TURN_IN_YEAR ? currentYear + 1 : currentYear;
}

/**
 * Derive fiscal year from the world calendar.
 * The world date is ISO day; calendar year from date string.
 * Fiscal year increments at turn 40 (October analogue).
 */
export function fiscalYearForTurn(dateIsoDay: string, turn: number): number {
  const year = Number.parseInt(dateIsoDay.slice(0, 4), 10);
  const y = Number.isFinite(year) ? year : 1953;
  return calculateFiscalYear(y, turn);
}
