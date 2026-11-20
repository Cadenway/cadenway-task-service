import { describe, expect, it } from 'vitest';

import { canChangeWatcher, effectiveWatchers } from './watcher.policy.js';

describe('watcher subscriptions (P3b-2 decisions 7 and 8)', () => {
  it('deduplicates creator and assignees and filters them by current eligibility', () => {
    expect(
      effectiveWatchers(
        { type: 'user', id: 'CAMILLE' },
        ['camille', 'ines', 'hugo'],
        [],
        new Set(['camille', 'ines']),
      ),
    ).toEqual(['camille', 'ines']);
  });

  it('keeps opt-outs through reassignment and adds explicit follows', () => {
    const overrides = [
      { userId: 'ines', following: false },
      { userId: 'lea', following: true },
    ];
    const eligible = new Set(['camille', 'ines', 'lea']);
    expect(
      effectiveWatchers({ type: 'user', id: 'camille' }, ['ines'], overrides, eligible),
    ).toEqual(['camille', 'lea']);
    expect(effectiveWatchers({ type: 'user', id: 'camille' }, [], overrides, eligible)).toEqual([
      'camille',
      'lea',
    ]);
    expect(
      effectiveWatchers({ type: 'user', id: 'camille' }, ['ines'], overrides, eligible),
    ).toEqual(['camille', 'lea']);
  });

  it('does not treat an automation creator as a human watcher', () => {
    expect(
      effectiveWatchers({ type: 'automation', id: 'rule' }, [], [], new Set(['rule'])),
    ).toEqual([]);
  });

  it('allows commenters to change only their own override and editors to change another', () => {
    expect(canChangeWatcher('comment', 'CAMILLE', 'camille')).toBe(true);
    expect(canChangeWatcher('comment', 'camille', 'ines')).toBe(false);
    expect(canChangeWatcher('view', 'camille', 'camille')).toBe(false);
    expect(canChangeWatcher('edit', 'camille', 'ines')).toBe(true);
  });
});
