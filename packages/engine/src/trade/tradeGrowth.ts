/**
 * tradeGrowth — solo port of src/lib/metricEngine/registry/economic.ts
 * tradeGrowthNode: the annual trade/import growth rate that compounds the
 * trade tax base (see budget/fiscalBaseGrowth.ts). An emergent trade-Laffer
 * curve: raising tariffs (or a punitive foreign-corporate tax) shrinks trade
 * growth; FTA partners, Cold War bloc membership, a weak (export-competitive)
 * currency, and manufacturing strength lift it.
 *
 * PORT-STUBs (cited per term, both contribute 0 by construction):
 *  - `ftaPartnerCount`: no free-trade-agreement system ported (no
 *    legislation/organization accession machinery for FTAs) — always 0.
 *  - `manufacturingCompetitiveness`: no such metric exists in AHDClient's
 *    macro model — held at MANUFACTURING_REF so its deviation term is 0.
 * Real, wired terms: tariff wedge (budget.taxRates.tariffs), foreign-tax
 * wedge (budget.taxRates.foreignCorporateTax), bloc membership (trade/bloc.ts,
 * substituting mainline's EU-only ECONOMIC_BLOC_ORG_IDS with the era-real
 * Cold War bloc — see bloc.ts file doc), and forex competitiveness
 * (world.exchangeRates rate/baseRate − 1, W4).
 */

export const WORLD_TRADE_BASELINE = 2.5;
export const TARIFF_WEDGE_K = 0.15;
export const FOREIGN_TAX_WEDGE_K = 0.03;
export const FTA_OPENNESS_K = 0.4;
export const BLOC_MEMBER_BONUS = 1.0;
export const FOREX_COMPETITIVENESS_K = 2.0;
export const MANUFACTURING_DRIFT_K = 0.02;
export const MANUFACTURING_REF = 60;

/** Source: tradeGrowthNode `inertia: 0.6`. */
export const TRADE_GROWTH_INERTIA = 0.6;
/** Source: tradeGrowthNode `bounds: [-30, 30]`. */
export const TRADE_GROWTH_BOUNDS: [number, number] = [-30, 30];

export interface TradeGrowthInputs {
  /** Percent, 0..100. */
  tariffPct: number;
  /** Percent, 0..100. */
  foreignCorporateTaxPct: number;
  /** PORT-STUB — always 0 (no FTA system). */
  ftaPartnerCount?: number;
  blocMember: boolean;
  /** rate/baseRate − 1 (>0 = weaker = more export-competitive). */
  forexStrength: number;
  /** PORT-STUB — always MANUFACTURING_REF (no manufacturing-competitiveness metric). */
  manufacturingCompetitiveness?: number;
}

/** The un-smoothed target tradeGrowth this turn, before the inertia EMA. */
export function computeTradeGrowthTarget(inputs: TradeGrowthInputs): number {
  const tariff = Number.isFinite(inputs.tariffPct) ? inputs.tariffPct : 0;
  const foreignTax = Number.isFinite(inputs.foreignCorporateTaxPct) ? inputs.foreignCorporateTaxPct : 0;
  const ftaPartnerCount = inputs.ftaPartnerCount ?? 0;
  const forex = Number.isFinite(inputs.forexStrength) ? inputs.forexStrength : 0;
  const mfg = inputs.manufacturingCompetitiveness ?? MANUFACTURING_REF;
  return (
    WORLD_TRADE_BASELINE -
    TARIFF_WEDGE_K * tariff -
    FOREIGN_TAX_WEDGE_K * foreignTax +
    FTA_OPENNESS_K * ftaPartnerCount +
    (inputs.blocMember ? BLOC_MEMBER_BONUS : 0) +
    FOREX_COMPETITIVENESS_K * forex +
    MANUFACTURING_DRIFT_K * (mfg - MANUFACTURING_REF)
  );
}

/**
 * Inertia-smoothed, bounded tradeGrowth for this turn. Source: tradeGrowthNode
 * `inertia: 0.6`, `bounds: [-30, 30]`, `decimals: 1`.
 */
export function advanceTradeGrowth(prevTradeGrowth: number, target: number): number {
  const prev = Number.isFinite(prevTradeGrowth) ? prevTradeGrowth : 0;
  const t = Number.isFinite(target) ? target : 0;
  const raw = TRADE_GROWTH_INERTIA * prev + (1 - TRADE_GROWTH_INERTIA) * t;
  const clamped = Math.max(TRADE_GROWTH_BOUNDS[0], Math.min(TRADE_GROWTH_BOUNDS[1], raw));
  return Math.round(clamped * 10) / 10;
}
