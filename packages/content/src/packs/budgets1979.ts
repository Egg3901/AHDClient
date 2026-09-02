import type { BudgetSeed } from "../types.js";
/**
 * Authored national budgets for 1979-default (US/UK/RU/DD). Generated from mainline AHDGame — DO NOT HAND-EDIT.
 * Generated: 2026-09-02 by packages/content/scripts/generateBudgets.ts (see its header for sources and the tax-rate derivation).
 * Units: gdp / otherRevenue / debt / spending in absolute local currency; economicFactors and taxRates in percent (same as the 1953 pack).
 */
export const BUDGETS_1979: BudgetSeed[] = [
  {
    // taxRates: incomeTax: us_federal_income_tax_rate option[6] = 30; domesticCorporateTax: us_federal_domestic_corporate_tax_rate option[9] = 36; foreignCorporateTax: us_federal_foreign_corporate_tax_rate option[7] = 42; payrollTax: us_federal_payroll_tax_rate option[4] = 12; tariffs: us_federal_tariff_rate option[0] = 0; salesTax: us_federal_sales_tax_rate option[0] = 0
    countryId: "US",
    fiscalYear: 1979,
    population: 225_000_000,
    gdp: 2_632_000_000_000,
    currencyCode: "USD",
    taxBaseRatios: {"taxableIncome":0.283,"corporateProfits":0.072,"wagesAndSalaries":0.45,"importValue":0.1,"taxableSales":0.5},
    taxRates: {"incomeTax":30,"domesticCorporateTax":36,"foreignCorporateTax":42,"payrollTax":12,"tariffs":0,"salesTax":0},
    otherRevenue: 80_000_000_000,
    debt: { principal: 829_000_000_000, interestRate: 0.095, ceiling: 879_000_000_000 },
    creditRating: "AAA",
    baselineSpendingByCategory: {"healthcare":42000000000,"defense":116000000000,"socialSecurity":102000000000,"education":13000000000,"infrastructure":18000000000,"other":213000000000},
    baselineStateGrants: 82_000_000_000,
    economicFactors: { gdpGrowth: 1.5, wageGrowth: 8, inflationRate: 11.3, tradeGrowth: 3 },
  },
  {
    // taxRates: incomeTax: uk_income_tax_rate option[5] = 20; domesticCorporateTax: uk_domestic_corporation_tax option[4] = 20; foreignCorporateTax: uk_foreign_corporation_tax option[3] = 19; payrollTax: uk_national_insurance option[5] = 12; tariffs: uk_excise_customs option[0] = 0; salesTax: uk_vat option[5] = 20
    countryId: "UK",
    fiscalYear: 1979,
    population: 56_200_000,
    gdp: 245_000_000_000,
    currencyCode: "GBP",
    taxBaseRatios: {"taxableIncome":0.45,"corporateProfits":0.08,"wagesAndSalaries":0.48,"importValue":0.28,"taxableSales":0.45},
    taxRates: {"incomeTax":20,"domesticCorporateTax":20,"foreignCorporateTax":19,"payrollTax":12,"tariffs":0,"salesTax":20},
    otherRevenue: 12_000_000_000,
    debt: { principal: 87_000_000_000, interestRate: 0.14, ceiling: 100_000_000_000 },
    creditRating: "AA",
    baselineSpendingByCategory: {"healthcare":12000000000,"defense":9500000000,"socialSecurity":20000000000,"education":9000000000,"infrastructure":5000000000,"other":20000000000},
    baselineStateGrants: 15_000_000_000,
    economicFactors: { gdpGrowth: -2.2, wageGrowth: 15, inflationRate: 13.4, tradeGrowth: 1 },
  },
  {
    // taxRates: incomeTax: su_individual_income_tax option[1] = 8; domesticCorporateTax: su_enterprise_levy option[4] = 55; payrollTax: su_social_insurance option[1] = 14; tariffs: su_customs_tariff option[2] = 25; salesTax: su_turnover_tax option[2] = 25; foreignCorporateTax mirrors domestic (no foreign law)
    countryId: "RU",
    fiscalYear: 1979,
    population: 182_300_000,
    gdp: 439_500_000_000,
    currencyCode: "SUR",
    taxBaseRatios: {"taxableIncome":0.05,"corporateProfits":0.32,"wagesAndSalaries":0.45,"importValue":0.1,"taxableSales":0.75},
    taxRates: {"incomeTax":8,"domesticCorporateTax":55,"foreignCorporateTax":55,"payrollTax":14,"tariffs":25,"salesTax":25},
    otherRevenue: 51_000_000_000,
    debt: { principal: 37_000_000_000, interestRate: 0.02, ceiling: 88_000_000_000 },
    creditRating: "AA",
    baselineSpendingByCategory: {"defense":44000000000,"education":22000000000,"healthcare":9000000000,"socialSecurity":33000000000,"infrastructure":66000000000,"other":29000000000},
    baselineStateGrants: 59_000_000_000,
    economicFactors: { gdpGrowth: 2.5, wageGrowth: 3, inflationRate: 1, tradeGrowth: 3 },
  },
  {
    // taxRates: incomeTax: dd_income_tax option[1] = 12; domesticCorporateTax: dd_enterprise_levy option[3] = 55; payrollTax: dd_social_insurance option[1] = 20; tariffs: dd_foreign_trade option[2] = 25; salesTax: dd_product_tax option[2] = 16; foreignCorporateTax mirrors domestic (no foreign law)
    countryId: "DD",
    fiscalYear: 1979,
    population: 16_700_000,
    gdp: 180_000_000_000,
    currencyCode: "DDM",
    taxBaseRatios: {"taxableIncome":0.05,"corporateProfits":0.32,"wagesAndSalaries":0.4,"importValue":0.12,"taxableSales":0.75},
    taxRates: {"incomeTax":12,"domesticCorporateTax":55,"foreignCorporateTax":55,"payrollTax":20,"tariffs":25,"salesTax":16},
    otherRevenue: 21_600_000_000,
    debt: { principal: 32_000_000_000, interestRate: 0.05, ceiling: 60_000_000_000 },
    creditRating: "A",
    baselineSpendingByCategory: {"socialSecurity":21600000000,"healthcare":9000000000,"education":10800000000,"defense":9000000000,"infrastructure":32400000000,"other":14400000000},
    baselineStateGrants: 10_800_000_000,
    economicFactors: { gdpGrowth: 2.5, wageGrowth: 3.5, inflationRate: 0.5, tradeGrowth: 3 },
  },
];
