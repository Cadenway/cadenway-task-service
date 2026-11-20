import { describe, expect, it } from 'vitest';

import { CAMILLE, INES } from '../../../domain/tasks.fixture.js';
import type { TaskFilterInput } from '../../models/query/task-filter-input.model.js';
import { TaskFilterBuilder } from './task-filter-builder.service.js';

/**
 * Builds the filters of a request that sends none.
 *
 * @param overrides - Fields to replace.
 * @returns The filters of the route.
 */
function input(overrides: Partial<TaskFilterInput> = {}): TaskFilterInput {
  return {
    statuses: null,
    priorities: null,
    assignees: null,
    labels: null,
    search: null,
    dueFrom: null,
    dueTo: null,
    level: 'roots',
    ...overrides,
  };
}

describe('TaskFilterBuilder: the filters of the route become what the repository compares', () => {
  const builder = new TaskFilterBuilder();

  it('leaves every filter out when the route sends none, and keeps the top-level tasks', () => {
    expect(builder.build(input(), CAMILLE)).toEqual({
      statuses: null,
      priorities: null,
      assignees: null,
      labelKeys: null,
      search: null,
      dueFrom: null,
      dueTo: null,
      rootsOnly: true,
    });
  });

  it('keeps the subtasks for level all', () => {
    expect(builder.build(input({ level: 'all' }), CAMILLE).rootsOnly).toBe(false);
  });

  it('passes each explicit milestone filter without altering the unfiltered query', () => {
    expect(builder.build(input({ milestone: true }), CAMILLE).milestone).toBe(true);
    expect(builder.build(input({ milestone: false }), CAMILLE).milestone).toBe(false);
    expect(builder.build(input(), CAMILLE).milestone).toBeUndefined();
  });

  it('resolves me to the actor and none to the flag', () => {
    expect(builder.build(input({ assignees: ['me', 'none', INES] }), CAMILLE).assignees).toEqual({
      userIds: [CAMILLE, INES],
      unassigned: true,
    });
  });

  it('asks for the unassigned tasks only with none alone', () => {
    expect(builder.build(input({ assignees: ['none'] }), CAMILLE).assignees).toEqual({
      userIds: [],
      unassigned: true,
    });
  });

  it('removes the duplicates, me and the account of the actor being one', () => {
    const filter = builder.build(
      input({
        assignees: ['me', CAMILLE, 'me'],
        statuses: ['todo', 'progress', 'todo'],
        priorities: ['haute', 'haute'],
      }),
      CAMILLE,
    );

    expect(filter.assignees).toEqual({ userIds: [CAMILLE], unassigned: false });
    expect(filter.statuses).toEqual(['todo', 'progress']);
    expect(filter.priorities).toEqual(['haute']);
  });

  it('lower-cases an account id', () => {
    expect(
      builder.build(input({ assignees: [INES.toUpperCase()] }), CAMILLE).assignees?.userIds,
    ).toEqual([INES]);
  });

  it('turns the labels into their keys, without regard to case, and keeps accents', () => {
    expect(
      builder.build(input({ labels: ['Auth', ' AUTH ', 'Sécurité', 'Securite'] }), CAMILLE)
        .labelKeys,
    ).toEqual(['auth', 'sécurité', 'securite']);
  });

  it('turns a blank label into the empty key, which no label has', () => {
    expect(builder.build(input({ labels: ['   '] }), CAMILLE).labelKeys).toEqual(['']);
  });

  it('passes the search text and the dates as sent', () => {
    const filter = builder.build(
      input({ search: ' SSO ', dueFrom: '2026-11-09', dueTo: '2026-11-15' }),
      CAMILLE,
    );

    expect(filter).toMatchObject({ search: ' SSO ', dueFrom: '2026-11-09', dueTo: '2026-11-15' });
  });
});
