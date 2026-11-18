import { describe, expect, it } from 'vitest';

import { splitCommaSeparated } from './comma-separated.validator.js';

describe('splitCommaSeparated', () => {
  it('splits a text on the commas', () => {
    expect(splitCommaSeparated('status,assign')).toEqual(['status', 'assign']);
  });

  it('gives a text without a comma as one item', () => {
    expect(splitCommaSeparated('status')).toEqual(['status']);
  });

  it('splits each text of a repeated parameter', () => {
    expect(splitCommaSeparated(['status,due', 'assign'])).toEqual(['status', 'due', 'assign']);
  });

  it('keeps an empty item, which the schema refuses', () => {
    expect(splitCommaSeparated('')).toEqual(['']);
    expect(splitCommaSeparated(',status')).toEqual(['', 'status']);
  });

  it('leaves an absent parameter and any other value as they are', () => {
    expect(splitCommaSeparated(undefined)).toBeUndefined();
    expect(splitCommaSeparated(7)).toBe(7);
    expect(splitCommaSeparated([{ kind: 'status' }])).toEqual([{ kind: 'status' }]);
    expect(splitCommaSeparated(['status', 1])).toEqual(['status', 1]);
  });
});
