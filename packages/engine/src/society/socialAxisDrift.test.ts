import { describe, it, expect } from 'vitest';
import { processSocialAxisDrift, SOCIAL_AXIS_DRIFT_RATE, SOCIAL_AXIS_MAX_DRIFT_PER_TURN } from './socialAxisDrift.js';

describe('processSocialAxisDrift', () => {
  it('should drift a single country with one socially differentiated law', () => {
    const input = {
      countryOrder: ['US'],
      registeredCountryIds: ['US'],
      countryConfigs: { US: { socialAxisBaseline: 0 } },
      countryStates: { US: { socialAxisPosition: 0, socialAxisDriftTurn: 10 } },
      nationalPolicies: {
        US: [
          { legislationTypeId: 'law1', social: 2, enactedTurn: 11 },
        ],
      },
      legislationTypes: {
        law1: { policyOptions: [{ social: 2 }, { social: 0 }] },
      },
      enactmentTurn: 11,
    };

    const result = processSocialAxisDrift(input);
    // delta = 0.05 * (2 - 0) = 0.1
    // next = 0 + 0.1 = 0.1
    expect(result.countriesProcessed).toBe(1);
    expect(result.lawsCounted).toBe(1);
    expect(result.updatedCountryStates['US']).toEqual({
      socialAxisPosition: 0.1,
      socialAxisDriftTurn: 11,
    });
  });

  it('should skip non-socially-differentiated laws', () => {
    const input = {
      countryOrder: ['US'],
      registeredCountryIds: ['US'],
      countryConfigs: { US: { socialAxisBaseline: 0 } },
      countryStates: { US: { socialAxisPosition: 0, socialAxisDriftTurn: 10 } },
      nationalPolicies: {
        US: [
          { legislationTypeId: 'law1', social: 2, enactedTurn: 11 },
          { legislationTypeId: 'law2', social: 0, enactedTurn: 11 },
        ],
      },
      legislationTypes: {
        law1: { policyOptions: [{ social: 2 }, { social: 0 }] },
        law2: { policyOptions: [{ social: 0 }, { social: 0 }] }, // not socially differentiated
      },
      enactmentTurn: 11,
    };

    const result = processSocialAxisDrift(input);
    expect(result.lawsCounted).toBe(1);
    expect(result.updatedCountryStates['US']!.socialAxisPosition).toBe(0.1);
  });

  it('should clamp delta to max per turn', () => {
    const input = {
      countryOrder: ['US'],
      registeredCountryIds: ['US'],
      countryConfigs: { US: { socialAxisBaseline: 0 } },
      countryStates: { US: { socialAxisPosition: 0, socialAxisDriftTurn: 10 } },
      nationalPolicies: {
        US: [
          { legislationTypeId: 'law1', social: 5, enactedTurn: 11 },
          { legislationTypeId: 'law2', social: 5, enactedTurn: 11 },
          { legislationTypeId: 'law3', social: 5, enactedTurn: 11 },
        ],
      },
      legislationTypes: {
        law1: { policyOptions: [{ social: 5 }] },
        law2: { policyOptions: [{ social: 5 }] },
        law3: { policyOptions: [{ social: 5 }] },
      },
      enactmentTurn: 11,
    };

    // delta = 0.05 * (5-0) * 3 = 0.75, clamped to 0.5
    const result = processSocialAxisDrift(input);
    expect(result.updatedCountryStates['US']!.socialAxisPosition).toBe(0.5);
  });

  it('should use baseline when position missing', () => {
    const input = {
      countryOrder: ['US'],
      registeredCountryIds: ['US'],
      countryConfigs: { US: { socialAxisBaseline: 1 } },
      countryStates: {}, // no state
      nationalPolicies: {},
      legislationTypes: {},
      enactmentTurn: 5,
    };

    const result = processSocialAxisDrift(input);
    // position = 1, watermark = 4, no laws -> delta 0, next = 1
    expect(result.updatedCountryStates['US']).toEqual({
      socialAxisPosition: 1,
      socialAxisDriftTurn: 5,
    });
  });

  it('should handle multiple countries independently', () => {
    const input = {
      countryOrder: ['US', 'CA'],
      registeredCountryIds: ['US', 'CA'],
      countryConfigs: { US: { socialAxisBaseline: 0 }, CA: { socialAxisBaseline: 0 } },
      countryStates: {
        US: { socialAxisPosition: 0, socialAxisDriftTurn: 10 },
        CA: { socialAxisPosition: 0, socialAxisDriftTurn: 10 },
      },
      nationalPolicies: {
        US: [{ legislationTypeId: 'law1', social: 2, enactedTurn: 11 }],
        CA: [{ legislationTypeId: 'law2', social: -1, enactedTurn: 11 }],
      },
      legislationTypes: {
        law1: { policyOptions: [{ social: 2 }] },
        law2: { policyOptions: [{ social: -1 }] },
      },
      enactmentTurn: 11,
    };

    const result = processSocialAxisDrift(input);
    expect(result.countriesProcessed).toBe(2);
    expect(result.lawsCounted).toBe(2);
    expect(result.updatedCountryStates['US']!.socialAxisPosition).toBe(0.1);
    expect(result.updatedCountryStates['CA']!.socialAxisPosition).toBe(-0.05);
  });
});
