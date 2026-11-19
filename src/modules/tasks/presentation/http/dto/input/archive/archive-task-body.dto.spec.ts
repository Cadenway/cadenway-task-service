import { describe, expect, it } from 'vitest';

import { ArchiveTaskBody } from './archive-task-body.dto.js';
import { UnarchiveTaskBody } from './unarchive-task-body.dto.js';

describe.each([
  ['an archive', ArchiveTaskBody],
  ['a restoration', UnarchiveTaskBody],
])('the body of %s', (_name, body) => {
  it('accepts the empty object of the contract and drops what it does not declare', () => {
    expect(body.schema.parse({})).toStrictEqual({});
    expect(body.schema.parse({ rootKey: 'CAD-482' })).toStrictEqual({});
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
