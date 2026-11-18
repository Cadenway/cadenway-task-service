import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { refuseUnstorableValues } from './storable-value.validator.js';

/** A schema that only walks the value it receives, to see the issues of the validator alone. */
const walker = z.unknown().superRefine((value: unknown, context) => {
  refuseUnstorableValues(context, value);
});

/**
 * Walks a value and returns where and why the validator refused it.
 *
 * @param value - The value.
 * @returns The path and the message of each issue, in the order they were raised.
 */
function issuesOf(value: unknown): { path: readonly PropertyKey[]; message: string }[] {
  const result = walker.safeParse(value);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
}

const NUL_MESSAGE = 'Expected a text without the character U+0000';
const YEAR_ZERO_MESSAGE = 'Expected a date from the year 0001';

describe('refuseUnstorableValues: a text with U+0000 is refused, PostgreSQL cannot store it', () => {
  it('refuses a text that holds the character', () => {
    expect(issuesOf('Pro\u0000duit')).toEqual([{ path: [], message: NUL_MESSAGE }]);
  });

  it('refuses a text made of the character only', () => {
    expect(issuesOf('\u0000')).toHaveLength(1);
  });

  it('accepts the other control characters, an accent and an emoji', () => {
    expect(issuesOf('Produit\n\té🚀')).toEqual([]);
  });

  it('accepts the text "0" and an empty text', () => {
    expect(issuesOf('0')).toEqual([]);
    expect(issuesOf('')).toEqual([]);
  });

  it('names the member that holds it, without quoting the value', () => {
    const issues = issuesOf({ name: 'Pro\u0000duit' });

    expect(issues).toEqual([{ path: ['name'], message: NUL_MESSAGE }]);
    expect(JSON.stringify(issues)).not.toContain('Pro');
  });
});

describe('refuseUnstorableValues: a date of the year 0000 is refused, PostgreSQL has no year 0', () => {
  it('refuses a calendar date of the year 0000', () => {
    expect(issuesOf('0000-11-03')).toEqual([{ path: [], message: YEAR_ZERO_MESSAGE }]);
  });

  it('accepts the year 0001 and a current date', () => {
    expect(issuesOf('0001-01-01')).toEqual([]);
    expect(issuesOf('2026-11-03')).toEqual([]);
  });

  it('accepts a text that only looks like a date of the year 0000', () => {
    expect(issuesOf('0000-11-03T08:00')).toEqual([]);
    expect(issuesOf('00000-11-03')).toEqual([]);
    expect(issuesOf('sprint 0000-11-03')).toEqual([]);
  });

  it('raises one issue for a text that breaks both rules', () => {
    expect(issuesOf('0000-11-03').length).toBe(1);
  });
});

describe('refuseUnstorableValues: it walks nested objects and arrays', () => {
  it('names the path of a value in a nested object', () => {
    expect(
      issuesOf({ statuses: { review: { name: 'Re\u0000vue' }, blocked: { name: 'Bloqué' } } }),
    ).toEqual([{ path: ['statuses', 'review', 'name'], message: NUL_MESSAGE }]);
  });

  it('names the index of a value in an array', () => {
    expect(issuesOf({ tags: ['ok', 'a\u0000b', 'fine'] })).toEqual([
      { path: ['tags', 1], message: NUL_MESSAGE },
    ]);
  });

  it('walks arrays of objects', () => {
    expect(issuesOf([{ day: '0000-01-01' }, { day: '2026-11-03' }])).toEqual([
      { path: [0, 'day'], message: YEAR_ZERO_MESSAGE },
    ]);
  });

  it('raises one issue per refused value', () => {
    expect(
      issuesOf({ name: 'a\u0000', sprint: { startDate: '0000-01-01', endDate: '0000-01-02' } }),
    ).toEqual([
      { path: ['name'], message: NUL_MESSAGE },
      { path: ['sprint', 'startDate'], message: YEAR_ZERO_MESSAGE },
      { path: ['sprint', 'endDate'], message: YEAR_ZERO_MESSAGE },
    ]);
  });

  it('ignores null, numbers, booleans and undefined', () => {
    expect(issuesOf({ a: null, b: 0, c: false, d: undefined, e: [null, 1] })).toEqual([]);
  });

  it('accepts a body with nothing to refuse', () => {
    expect(
      issuesOf({ name: 'Sprint 14', sprint: { startDate: '2026-11-03', endDate: '2026-11-17' } }),
    ).toEqual([]);
  });
});
