import { describe, expect, it } from 'vitest';

import { TaskGroupsQuery } from '../../dto/input/query/task-groups-query.dto.js';
import { ListTasksQuery } from '../../dto/input/task/list-tasks-query.dto.js';
import { taskFilterFingerprint, toTaskFilterInput, toTaskOrder } from './task-filter.mapper.js';

const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';

describe('the filters of the tasks of a list', () => {
  it('preserves both boolean filters and separates them from the unfiltered cursor', () => {
    const all = toTaskFilterInput(ListTasksQuery.schema.parse({}));
    const milestones = toTaskFilterInput(ListTasksQuery.schema.parse({ milestone: 'true' }));
    const tasks = toTaskFilterInput(
      TaskGroupsQuery.schema.parse({ groupBy: 'status', milestone: 'false' }),
    );

    expect(taskFilterFingerprint(all)).not.toHaveProperty('milestone');
    expect(taskFilterFingerprint(milestones)).toHaveProperty('milestone', true);
    expect(taskFilterFingerprint(tasks)).toHaveProperty('milestone', false);
  });

  it('leaves a filter the query does not name to null and reads the level as given', () => {
    expect(toTaskFilterInput({ level: 'roots' })).toEqual({
      statuses: null,
      priorities: null,
      assignees: null,
      labels: null,
      search: null,
      dueFrom: null,
      dueTo: null,
      level: 'roots',
    });
  });

  it('passes the values as sent, for the use case to normalize them in one place', () => {
    expect(
      toTaskFilterInput({
        status: ['todo', 'todo', 'review'],
        priority: ['haute', 'haute'],
        assignee: ['me', CAMILLE.toUpperCase(), CAMILLE, 'none', 'me'],
        label: ['Auth', 'auth', 'Auth'],
        search: ' SSO ',
        dueFrom: '2026-11-01',
        dueTo: '2026-11-30',
        level: 'all',
      }),
    ).toEqual({
      statuses: ['todo', 'todo', 'review'],
      priorities: ['haute', 'haute'],
      assignees: ['me', CAMILLE.toUpperCase(), CAMILLE, 'none', 'me'],
      labels: ['Auth', 'auth', 'Auth'],
      search: ' SSO ',
      dueFrom: '2026-11-01',
      dueTo: '2026-11-30',
      level: 'all',
    });
  });

  it('fingerprints the same collection whatever the order of the values', () => {
    expect(
      taskFilterFingerprint(
        toTaskFilterInput({ status: ['review', 'todo'], assignee: ['none', 'me'], level: 'roots' }),
      ),
    ).toEqual(
      taskFilterFingerprint(
        toTaskFilterInput({ status: ['todo', 'review'], assignee: ['me', 'none'], level: 'roots' }),
      ),
    );
  });

  it('fingerprints the same collection whatever the case and the duplicates of the accounts', () => {
    expect(
      taskFilterFingerprint(
        toTaskFilterInput({ assignee: [CAMILLE.toUpperCase(), 'me', CAMILLE], level: 'roots' }),
      ),
    ).toEqual(
      taskFilterFingerprint(toTaskFilterInput({ assignee: ['me', CAMILLE], level: 'roots' })),
    );
  });

  it('reads the sort as a key and a direction', () => {
    expect(toTaskOrder('manual')).toEqual({ key: 'manual', descending: false });
    expect(toTaskOrder('-manual')).toEqual({ key: 'manual', descending: true });
    expect(toTaskOrder('dueDate')).toEqual({ key: 'dueDate', descending: false });
    expect(toTaskOrder('-priority')).toEqual({ key: 'priority', descending: true });
    expect(toTaskOrder('-name')).toEqual({ key: 'name', descending: true });
    expect(toTaskOrder('createdAt')).toEqual({ key: 'createdAt', descending: false });
    expect(toTaskOrder('-createdAt')).toEqual({ key: 'createdAt', descending: true });
  });
});
