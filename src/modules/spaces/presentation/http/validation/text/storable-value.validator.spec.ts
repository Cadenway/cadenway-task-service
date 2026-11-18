import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { CreateListBody } from '../../dto/input/list/create-list-body.dto.js';
import { UpdateListBody } from '../../dto/input/list/update-list-body.dto.js';
import { CreateSpaceBody } from '../../dto/input/space/create-space-body.dto.js';
import { UpdateSpaceBody } from '../../dto/input/space/update-space-body.dto.js';
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

describe('refuseUnstorableValues: a sprint date of the year 0000 is refused, PostgreSQL has no year 0', () => {
  it.each(['startDate', 'endDate'])(
    'refuses a calendar date of the year 0000 in the %s of a sprint',
    (member) => {
      expect(issuesOf({ sprint: { [member]: '0000-11-03' } })).toEqual([
        { path: ['sprint', member], message: YEAR_ZERO_MESSAGE },
      ]);
    },
  );

  it('accepts the year 0001 and a current date in a sprint date', () => {
    expect(issuesOf({ sprint: { startDate: '0001-01-01', endDate: '2026-11-03' } })).toEqual([]);
  });

  it('accepts a text that only looks like a date of the year 0000, in a date member', () => {
    expect(issuesOf({ sprint: { startDate: '0000-11-03T08:00' } })).toEqual([]);
    expect(issuesOf({ sprint: { startDate: '00000-11-03' } })).toEqual([]);
    expect(issuesOf({ sprint: { endDate: 'sprint 0000-11-03' } })).toEqual([]);
  });

  it('accepts a name, a description, a goal or a status name that reads 0000-11-03', () => {
    expect(
      issuesOf({
        name: '0000-11-03',
        description: '0000-11-03',
        sprint: { goal: '0000-11-03' },
        statuses: { review: { name: '0000-11-03' } },
      }),
    ).toEqual([]);
  });

  it('accepts a bare text that reads 0000-11-03, which is no date member', () => {
    expect(issuesOf('0000-11-03')).toEqual([]);
  });

  it('still refuses U+0000 in a text that reads like a date, on any member', () => {
    expect(issuesOf({ name: '0000-11-03\u0000' })).toEqual([
      { path: ['name'], message: NUL_MESSAGE },
    ]);
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
    expect(issuesOf({ sprint: [{ endDate: '0000-01-01' }, { endDate: '2026-11-03' }] })).toEqual([
      { path: ['sprint', 0, 'endDate'], message: YEAR_ZERO_MESSAGE },
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

describe('the bodies of the spaces and the lists refuse unstorable values on the member', () => {
  it('refuses U+0000 in the name of a new space and in its description', () => {
    const result = CreateSpaceBody.schema.safeParse({
      name: 'Pro\u0000duit',
      prefix: 'CAD',
      description: 'Le\u0000produit',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([['name'], ['description']]);
    }
  });

  it('refuses U+0000 in a status name nested in the patch of a space', () => {
    const result = UpdateSpaceBody.schema.safeParse({
      statuses: { review: { name: 'Re\u0000vue' }, blocked: { name: 'Bloqué' }, done: null },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([
        ['statuses', 'review', 'name'],
      ]);
    }
  });

  it('accepts a status patch with nothing to refuse', () => {
    expect(
      UpdateSpaceBody.schema.safeParse({ statuses: { review: { name: 'Revue' }, done: null } })
        .success,
    ).toBe(true);
  });

  it('refuses the year 0000 in the dates of the sprint of a new list', () => {
    const result = CreateListBody.schema.safeParse({
      name: 'Sprint 14',
      sprint: { startDate: '0000-11-03', endDate: '2026-11-17' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
        'sprint',
        'startDate',
      ]);
      expect(result.error.issues.map((issue) => issue.path)).not.toContainEqual([
        'sprint',
        'endDate',
      ]);
    }
  });

  it('refuses the year 0000 and U+0000 in the patch of a list, on each member', () => {
    const result = UpdateListBody.schema.safeParse({
      name: 'Sprint\u0000 14',
      sprint: { startDate: '2026-11-03', endDate: '0000-11-17', goal: 'Livrer\u0000' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining([['name'], ['sprint', 'endDate'], ['sprint', 'goal']]),
      );
    }
  });

  it('accepts Sprint 14 as the contract writes it', () => {
    expect(
      CreateListBody.schema.safeParse({
        name: 'Sprint 14',
        sprint: {
          startDate: '2026-11-03',
          endDate: '2026-11-17',
          goal: 'Livrer la connexion SSO et la page des quotas d’organisation.',
        },
      }).success,
    ).toBe(true);
  });
});
