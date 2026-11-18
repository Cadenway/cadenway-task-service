import { describe, expect, it } from 'vitest';

import { AssignTaskBody } from './assign-task-body.dto.js';

describe('the body of an assignment', () => {
  it('accepts the empty object of the contract', () => {
    expect(AssignTaskBody.schema.safeParse({}).success).toBe(true);
  });

  it('drops the members the contract does not declare', () => {
    expect(AssignTaskBody.schema.parse({ userId: 'someone-else' })).toStrictEqual({});
  });

  it.each([
    ['a missing body', undefined],
    ['an array', []],
    ['a text', 'x'],
    ['null', null],
  ])('refuses %s', (_name, body) => {
    expect(AssignTaskBody.schema.safeParse(body).success).toBe(false);
  });
});
