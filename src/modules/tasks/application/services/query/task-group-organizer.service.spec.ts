import { PRIORITY_KEYS } from '../../../domain/value-objects/task/priority-key.value-object.js';
import { STATUS_KEYS } from '../../../domain/value-objects/task/status-key.value-object.js';
import { describe, expect, it } from 'vitest';

import { CAMILLE, HUGO, INES, LEA } from '../../../domain/tasks.fixture.js';
import { TaskGroupOrganizer } from './task-group-organizer.service.js';

describe('TaskGroupOrganizer: the groups of a list in the order of the contract', () => {
  const organizer = new TaskGroupOrganizer();

  it('gives the ten statuses in the order of the workflow, zeros included', () => {
    const groups = organizer.organize('status', [
      { value: 'done', count: 24 },
      { value: 'todo', count: 3 },
    ]);

    expect(groups.map((group) => group.value)).toEqual(STATUS_KEYS);
    expect(groups.find((group) => group.value === 'done')?.count).toBe(24);
    expect(groups.find((group) => group.value === 'review')?.count).toBe(0);
  });

  it('gives the four priorities from urgente to basse, zeros included', () => {
    const groups = organizer.organize('priority', [{ value: 'basse', count: 2 }]);

    expect(groups).toEqual(
      PRIORITY_KEYS.map((value) => ({ value, count: value === 'basse' ? 2 : 0 })),
    );
  });

  it('ignores a value of a closed set that the contract does not know', () => {
    expect(organizer.organize('priority', [{ value: 'critique', count: 9 }])).toHaveLength(4);
  });

  it('orders the assignees by count descending, ties by account id, and puts none last', () => {
    const groups = organizer.organize('assignee', [
      { value: 'none', count: 5 },
      { value: LEA, count: 2 },
      { value: INES, count: 7 },
      { value: HUGO, count: 2 },
      { value: CAMILLE, count: 7 },
    ]);

    expect(groups.map((group) => group.value)).toEqual([CAMILLE, INES, HUGO, LEA, 'none']);
  });

  it('always answers none, with 0 when the repository did not count it', () => {
    expect(organizer.organize('assignee', [])).toEqual([{ value: 'none', count: 0 }]);
  });

  it('leaves out an account without a task', () => {
    expect(organizer.organize('assignee', [{ value: CAMILLE, count: 0 }])).toEqual([
      { value: 'none', count: 0 },
    ]);
  });

  describe('after', () => {
    const statuses = organizer.organize('status', []);
    const assignees = organizer.organize('assignee', [
      { value: CAMILLE, count: 7 },
      { value: INES, count: 7 },
      { value: HUGO, count: 2 },
      { value: 'none', count: 1 },
    ]);

    it('keeps everything for the first page', () => {
      expect(organizer.after('status', statuses, null)).toBe(statuses);
    });

    it('starts a status page after the status of the position', () => {
      expect(
        organizer.after('status', statuses, { value: 'review', count: 0 }).map((g) => g.value),
      ).toEqual(['testing', 'waiting', 'blocked', 'done', 'cancelled']);
    });

    it('starts an assignee page after the count then the account id of the position', () => {
      expect(
        organizer.after('assignee', assignees, { value: CAMILLE, count: 7 }).map((g) => g.value),
      ).toEqual([INES, HUGO, 'none']);
    });

    it('does not repeat or skip an account whose count changed since the previous page', () => {
      expect(
        organizer.after('assignee', assignees, { value: CAMILLE, count: 9 }).map((g) => g.value),
      ).toEqual([CAMILLE, INES, HUGO, 'none']);
    });

    it('keeps none after the last account, and nothing after none', () => {
      expect(
        organizer.after('assignee', assignees, { value: HUGO, count: 2 }).map((g) => g.value),
      ).toEqual(['none']);
      expect(organizer.after('assignee', assignees, { value: 'none', count: 1 })).toEqual([]);
    });
  });
});
