import { describe, expect, it } from 'vitest';

import { EmptyTrashBody } from './empty-trash-body.dto.js';
import { RestoreTrashEntryBody } from './restore-trash-entry-body.dto.js';
import { TrashEntriesQuery } from './trash-entries-query.dto.js';
import { TrashEntryPath } from './trash-entry-path.dto.js';
import { TrashTaskBody } from './trash-task-body.dto.js';

describe.each([
  ['a deletion', TrashTaskBody],
  ['a restoration from the trash', RestoreTrashEntryBody],
  ['"Vider la corbeille"', EmptyTrashBody],
])('the body of %s', (_name, body) => {
  it('accepts the empty object of the contract and drops what it does not declare', () => {
    expect(body.schema.parse({})).toStrictEqual({});
    expect(body.schema.parse({ entryId: 'x' })).toStrictEqual({});
  });

  it.each([
    ['a missing body', undefined],
    ['an array', []],
    ['a text', 'x'],
    ['null', null],
  ])('refuses %s', (_case, value) => {
    expect(body.schema.safeParse(value).success).toBe(false);
  });
});

describe('the path of a trash entry', () => {
  it('accepts a UUID', () => {
    expect(
      TrashEntryPath.schema.parse({ entryId: '019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e01' }),
    ).toEqual({ entryId: '019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e01' });
  });

  it.each(['CAD-452', '019a7006', ''])('refuses %j', (entryId: string) => {
    expect(TrashEntryPath.schema.safeParse({ entryId }).success).toBe(false);
  });
});

describe('the query of the trash', () => {
  it('takes 50 entries by default and reads limit as a number', () => {
    expect(TrashEntriesQuery.schema.parse({})).toEqual({ limit: 50 });
    expect(TrashEntriesQuery.schema.parse({ limit: '10', cursor: 'abc' })).toEqual({
      limit: 10,
      cursor: 'abc',
    });
  });

  it.each(['0', '101', 'x'])('refuses the limit %s', (limit: string) => {
    expect(TrashEntriesQuery.schema.safeParse({ limit }).success).toBe(false);
  });
});
