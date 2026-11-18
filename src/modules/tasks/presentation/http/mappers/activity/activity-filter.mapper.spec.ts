import { describe, expect, it } from 'vitest';

import { toActorIds, toKinds } from './activity-filter.mapper.js';

describe('toKinds', () => {
  it('gives null when the query names no kind: every kind', () => {
    expect(toKinds(undefined)).toBeNull();
  });

  it('drops a kind named twice', () => {
    expect(toKinds(['status', 'assign', 'status'])).toEqual(['status', 'assign']);
  });
});

describe('toActorIds', () => {
  const camille = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';

  it('gives null when the query names no actor: every actor', () => {
    expect(toActorIds(undefined)).toBeNull();
  });

  it('lower-cases an account id and keeps the id of any other actor as sent', () => {
    expect(toActorIds([camille.toUpperCase(), 'task-service', 'Octo-Bot'])).toEqual([
      camille,
      'task-service',
      'Octo-Bot',
    ]);
  });

  it('drops an actor named twice once the case of the accounts is the same', () => {
    expect(toActorIds([camille, camille.toUpperCase()])).toEqual([camille]);
  });
});
