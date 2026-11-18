import { ProblemException } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import { toExpectedVersions } from './expected-versions.mapper.js';
import { toVersionCondition } from './version-condition.mapper.js';

/**
 * Runs a mapping and returns the problem it throws.
 *
 * @param map - The mapping.
 * @returns The problem.
 */
function refusalOf(map: () => unknown): ProblemException {
  try {
    map();
  } catch (error) {
    if (error instanceof ProblemException) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected a refusal.');
}

describe('toExpectedVersions', () => {
  it('gives no condition without a header and for *', () => {
    expect(toExpectedVersions(undefined)).toBeNull();
    expect(toExpectedVersions('*')).toBeNull();
  });

  it('gives the versions of a list of entity tags and drops a weak one', () => {
    expect(toExpectedVersions('"3", "5"')).toEqual([3, 5]);
    expect(toExpectedVersions('W/"3"')).toEqual([]);
  });

  it('refuses a header that is not a list of entity tags, on the If-Match header', () => {
    const refusal: ProblemException = refusalOf(() => toExpectedVersions('3'));

    expect(refusal.problem.status).toBe(400);
    expect(refusal.problem.code).toBe('request.invalid');
    expect(refusal.problem.details).toMatchObject({
      issues: [{ in: 'header', path: 'If-Match', code: 'invalid_format' }],
    });
  });
});

describe('toVersionCondition', () => {
  it('lets an absent header through when it is optional', () => {
    expect(toVersionCondition(undefined, false)).toBeNull();
  });

  it('refuses an absent header when it is required, on the If-Match header', () => {
    const refusal: ProblemException = refusalOf(() => toVersionCondition(undefined, true));

    expect(refusal.problem.status).toBe(400);
    expect(refusal.problem.code).toBe('request.invalid');
    expect(refusal.problem.details).toMatchObject({
      issues: [{ in: 'header', path: 'If-Match', code: 'invalid_type' }],
    });
  });

  it('accepts * and a list of versions whether the header is required or not', () => {
    expect(toVersionCondition('*', true)).toBeNull();
    expect(toVersionCondition('"4"', true)).toEqual([4]);
    expect(toVersionCondition('"4"', false)).toEqual([4]);
  });

  it('refuses a malformed header whether it is required or not', () => {
    expect(refusalOf(() => toVersionCondition('4', true)).problem.details).toMatchObject({
      issues: [{ code: 'invalid_format' }],
    });
    expect(refusalOf(() => toVersionCondition('4', false)).problem.details).toMatchObject({
      issues: [{ code: 'invalid_format' }],
    });
  });
});
