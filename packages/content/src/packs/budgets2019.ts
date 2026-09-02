import type { BudgetSeed } from "../types.js";
/**
 * Authored national budgets for 2019-default (US/UK/JP/DE/CN/IE). Generated from mainline AHDGame — DO NOT HAND-EDIT.
 * Generated: 2026-09-02 by packages/content/scripts/generateBudgets.ts (see its header for sources and the tax-rate derivation).
 * Units: gdp / otherRevenue / debt / spending in absolute local currency; economicFactors and taxRates in percent (same as the 1953 pack).
 */
export const BUDGETS_2019: BudgetSeed[] = [
  {
    // taxRates: incomeTax: us_federal_income_tax_rate option[4] = 20; domesticCorporateTax: us_federal_domestic_corporate_tax_rate option[5] = 20; foreignCorporateTax: us_federal_foreign_corporate_tax_rate option[3] = 18; payrollTax: us_federal_payroll_tax_rate option[5] = 15; tariffs: us_federal_tariff_rate option[0] = 0; salesTax: us_federal_sales_tax_rate option[0] = 0
    countryId: "US",
    fiscalYear: 2020,
    population: 333_000_000,
    gdp: 27_000_000_000_000,
    currencyCode: "USD",
    taxBaseRatios: {"taxableIncome":0.3537,"corporateProfits":0.0796,"wagesAndSalaries":0.3148,"importValue":0.1852,"taxableSales":0.5556},
    taxRates: {"incomeTax":20,"domesticCorporateTax":20,"foreignCorporateTax":18,"payrollTax":15,"tariffs":0,"salesTax":0},
    otherRevenue: 200_000_000_000,
    debt: { principal: 28_500_000_000_000, interestRate: 0.021, ceiling: 31_400_000_000_000 },
    creditRating: "AA",
    baselineSpendingByCategory: {"healthcare":650000000000,"defense":800000000000,"socialSecurity":900000000000,"education":150000000000,"infrastructure":120000000000,"other":700000000000},
    baselineStateGrants: 600_000_000_000,
    economicFactors: { gdpGrowth: 2.5, wageGrowth: 3, inflationRate: 2.5, tradeGrowth: 2 },
  },
  {
    // taxRates: incomeTax: uk_income_tax_rate option[5] = 20; domesticCorporateTax: uk_domestic_corporation_tax option[4] = 20; foreignCorporateTax: uk_foreign_corporation_tax option[3] = 19; payrollTax: uk_national_insurance option[5] = 12; tariffs: uk_excise_customs option[0] = 0; salesTax: uk_vat option[5] = 20
    countryId: "UK",
    fiscalYear: 2020,
    population: 68_000_000,
    gdp: 2_900_000_000_000,
    currencyCode: "GBP",
    taxBaseRatios: {"taxableIncome":0.5517,"corporateProfits":0.1655,"wagesAndSalaries":0.5345,"importValue":0.1552,"taxableSales":0.3293},
    taxRates: {"incomeTax":20,"domesticCorporateTax":20,"foreignCorporateTax":19,"payrollTax":12,"tariffs":0,"salesTax":20},
    otherRevenue: 188_250_000_000,
    debt: { principal: 2_820_000_000_000, interestRate: 0.046, ceiling: 3_300_000_000_000 },
    creditRating: "A",
    baselineSpendingByCategory: {"health":190000000000,"education":95000000000,"statePensions":135000000000,"welfare":125000000000,"defense":60000000000,"transport":28000000000,"localGovernment":40000000000,"other":330000000000},
    baselineStateGrants: 75_000_000_000,
    economicFactors: { gdpGrowth: 1.2, wageGrowth: 3.1, inflationRate: 3.2, tradeGrowth: 1 },
  },
  {
    // taxRates: incomeTax: jp_income_tax_rate option[5] = 25; domesticCorporateTax: jp_domestic_corporation_tax option[5] = 23; foreignCorporateTax: jp_foreign_corporation_tax option[3] = 19; payrollTax: jp_social_insurance option[5] = 15; tariffs: jp_customs_tariff option[0] = 0; salesTax: jp_consumption_tax option[5] = 10
    countryId: "JP",
    fiscalYear: 2020,
    population: 126_000_000,
    gdp: 550_000_000_000_000,
    currencyCode: "JPY",
    taxBaseRatios: {"taxableIncome":0.4,"corporateProfits":0.12,"wagesAndSalaries":0.42,"importValue":0.14,"taxableSales":0.38},
    taxRates: {"incomeTax":25,"domesticCorporateTax":23,"foreignCorporateTax":19,"payrollTax":15,"tariffs":0,"salesTax":10},
    otherRevenue: 12_000_000_000_000,
    debt: { principal: 1_200_000_000_000_000, interestRate: 0.01, ceiling: 1_500_000_000_000_000 },
    creditRating: "A",
    baselineSpendingByCategory: {"health":42000000000000,"education":5500000000000,"statePensions":58000000000000,"welfare":30000000000000,"defense":5400000000000,"transport":7000000000000,"localGovernment":16000000000000,"other":40000000000000},
    baselineStateGrants: 18_000_000_000_000,
    economicFactors: { gdpGrowth: 0.6, wageGrowth: 1, inflationRate: 0.5, tradeGrowth: 0.3 },
  },
  {
    // taxRates: incomeTax: de_income_tax_rate option[5] = 42; domesticCorporateTax: de_domestic_corporate_tax_rate option[5] = 15; foreignCorporateTax: de_foreign_corporate_tax_rate option[5] = 15; payrollTax: de_payroll_social_insurance option[5] = 20; tariffs: de_customs_tariff_rate option[0] = 0; salesTax: de_vat_rate option[5] = 19; PORT-STUB budget/extraTaxLines (laws): solidaritySurcharge:de_solidarity_surcharge
    countryId: "DE",
    fiscalYear: 2020,
    population: 84_400_000,
    gdp: 4_500_000_000_000,
    currencyCode: "EUR",
    taxBaseRatios: {"taxableIncome":0.46,"corporateProfits":0.11,"wagesAndSalaries":0.44,"importValue":0.34,"taxableSales":0.5},
    taxRates: {"incomeTax":42,"domesticCorporateTax":15,"foreignCorporateTax":15,"payrollTax":20,"tariffs":0,"salesTax":19},
    otherRevenue: 90_000_000_000,
    debt: { principal: 2_450_000_000_000, interestRate: 0.028, ceiling: 3_000_000_000_000 },
    creditRating: "AAA",
    baselineSpendingByCategory: {"health":220000000000,"education":85000000000,"pensions":165000000000,"welfare":120000000000,"defense":65000000000,"transport":55000000000,"localGovernment":95000000000,"environment":40000000000,"other":210000000000},
    baselineStateGrants: 125_000_000_000,
    economicFactors: { gdpGrowth: 1.1, wageGrowth: 2.3, inflationRate: 1.8, tradeGrowth: 1.4 },
  },
  {
    // taxRates: incomeTax: cn_individual_income_tax option[7] = 45; domesticCorporateTax: cn_enterprise_income_tax option[5] = 25; payrollTax: cn_social_insurance_contribution option[5] = 28; tariffs: cn_customs_tariff option[0] = 0; salesTax: cn_value_added_tax option[5] = 13; PORT-STUB budget/extraTaxLines (laws): landValueAddedTax:cn_land_value_added_tax, urbanMaintenanceTax:cn_urban_maintenance_construction_tax, stampDuty:cn_stamp_duty; foreignCorporateTax mirrors domestic (no foreign law)
    countryId: "CN",
    fiscalYear: 2023,
    population: 1_412_000_000,
    gdp: 126_000_000_000_000,
    currencyCode: "CNY",
    taxBaseRatios: {"taxableIncome":0.03,"corporateProfits":0.14,"wagesAndSalaries":0.11,"importValue":0.18,"taxableSales":0.44},
    taxRates: {"incomeTax":45,"domesticCorporateTax":25,"foreignCorporateTax":25,"payrollTax":28,"tariffs":0,"salesTax":13},
    otherRevenue: 2_000_000_000_000,
    debt: { principal: 32_000_000_000_000, interestRate: 0.035, ceiling: 40_000_000_000_000 },
    creditRating: "A",
    baselineSpendingByCategory: {"education":4100448000000,"socialSecurity":3899944000000,"infrastructure":3500348000000,"other":3138876000000,"agriculture":2401812000000,"publicSafety":2300148000000,"health":2199896000000,"defense":1599796000000},
    baselineStateGrants: 9_000_000_000_000,
    economicFactors: { gdpGrowth: 5.2, wageGrowth: 5, inflationRate: 0.2, tradeGrowth: 4.5 },
  },
  {
    // taxRates: incomeTax: ie_income_tax_rate option[7] = 40; domesticCorporateTax: ie_corporate_tax_rate option[3] = 12.5; foreignCorporateTax: ie_foreign_corporate_tax_rate option[3] = 12.5; payrollTax: ie_prsi option[5] = 11; tariffs: ie_customs_tariff_rate option[0] = 0; salesTax: ie_vat_rate option[6] = 23; PORT-STUB budget/extraTaxLines (laws): propertyTax:ie_local_property_tax, stampDuty:ie_stamp_duty, universalSocialCharge:ie_usc, capitalGainsTax:ie_capital_gains_tax, exciseDuty:ie_excise_duty
    countryId: "IE",
    fiscalYear: 2023,
    population: 5_100_000,
    gdp: 500_000_000_000,
    currencyCode: "IEP",
    taxBaseRatios: {"taxableIncome":0.13,"corporateProfits":0.22,"wagesAndSalaries":0.23,"importValue":0.28,"taxableSales":0.12},
    taxRates: {"incomeTax":40,"domesticCorporateTax":12.5,"foreignCorporateTax":12.5,"payrollTax":11,"tariffs":0,"salesTax":23},
    otherRevenue: 8_000_000_000,
    debt: { principal: 235_000_000_000, interestRate: 0.025, ceiling: 300_000_000_000 },
    creditRating: "AA",
    baselineSpendingByCategory: {"health":24490200000,"education":10985400000,"socialProtection":15896700000,"housing":7002300000,"transport":5701800000,"defense":1300500000,"other":11796300000},
    baselineStateGrants: 8_000_000_000,
    economicFactors: { gdpGrowth: 3.5, wageGrowth: 4, inflationRate: 3.2, tradeGrowth: 2.5 },
  },
];
