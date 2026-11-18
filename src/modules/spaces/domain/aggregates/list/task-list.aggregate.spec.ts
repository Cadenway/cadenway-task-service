import { describe, expect, it } from 'vitest';

import { InvalidListError } from '../../errors/list/invalid-list.error.js';
import { SprintDatesInvalidError } from '../../errors/list/sprint-dates-invalid.error.js';
import {
  ATELIER_NORD,
  PRODUIT,
  SPRINT_14_GOAL,
  backlogState,
  sprintState,
} from '../../spaces.fixture.js';
import type { NewTaskList } from '../../value-objects/list/new-task-list.value-object.js';
import type { TaskListDraft } from '../../value-objects/list/task-list-draft.value-object.js';
import type { TaskListState } from '../../value-objects/list/task-list-state.value-object.js';
import type { TaskListUpdate } from '../../value-objects/list/task-list-update.value-object.js';
import { TaskList } from './task-list.aggregate.js';

/**
 * Builds the creation of the list "Backlog" of the space "Produit".
 *
 * @param overrides - Fields to replace.
 * @returns The new list.
 */
function newList(overrides: Partial<NewTaskList> = {}): NewTaskList {
  return {
    organizationId: ATELIER_NORD,
    spaceId: PRODUIT,
    name: 'Backlog',
    icon: null,
    color: 'gris',
    sprint: null,
    ...overrides,
  };
}

/**
 * Builds the creation of Sprint 14 with its dates and goal.
 *
 * @param overrides - Fields to replace.
 * @returns The new sprint.
 */
function newSprint(overrides: Partial<NewTaskList> = {}): NewTaskList {
  return newList({
    name: 'Sprint 14',
    color: 'indigo',
    sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: SPRINT_14_GOAL },
    ...overrides,
  });
}

/**
 * Restores Sprint 14, or another state.
 *
 * @param overrides - Fields to replace.
 * @returns The list.
 */
function sprint14(overrides: Partial<TaskListState> = {}): TaskList {
  return TaskList.restore(sprintState(overrides));
}

/**
 * Restores the list "Backlog", which is no sprint.
 *
 * @param overrides - Fields to replace.
 * @returns The list.
 */
function backlog(overrides: Partial<TaskListState> = {}): TaskList {
  return TaskList.restore(backlogState(overrides));
}

describe('TaskList.create: the name is trimmed and has 1 to 80 characters', () => {
  it('trims the name', () => {
    expect(TaskList.create(newList({ name: '  Backlog ' })).name).toBe('Backlog');
  });

  it('refuses an empty name or one made only of spaces', () => {
    expect(() => TaskList.create(newList({ name: '' }))).toThrow(InvalidListError);
    expect(() => TaskList.create(newList({ name: '   ' }))).toThrow(InvalidListError);
  });

  it('accepts a name of 80 characters and refuses one of 81', () => {
    expect(TaskList.create(newList({ name: 'a'.repeat(80) })).name).toHaveLength(80);
    expect(() => TaskList.create(newList({ name: 'a'.repeat(81) }))).toThrow(InvalidListError);
  });

  it('refuses an icon or a color the contract does not list', () => {
    expect(() => TaskList.create(newList({ icon: 'sailboat' as NewTaskList['icon'] }))).toThrow(
      InvalidListError,
    );
    expect(() => TaskList.create(newList({ color: 'turquoise' as NewTaskList['color'] }))).toThrow(
      InvalidListError,
    );
  });

  it('refuses a list with no organization or no space', () => {
    expect(() => TaskList.create(newList({ organizationId: '' }))).toThrow(InvalidListError);
    expect(() => TaskList.create(newList({ spaceId: '' }))).toThrow(InvalidListError);
  });

  it('creates a list that is no sprint when it has no dates', () => {
    expect(TaskList.create(newList())).toEqual({
      organizationId: ATELIER_NORD,
      spaceId: PRODUIT,
      name: 'Backlog',
      icon: null,
      color: 'gris',
      sprint: null,
    });
  });
});

describe('TaskList.create: a sprint ends on or after its first day', () => {
  it('creates Sprint 14 with its dates and its goal', () => {
    const draft: TaskListDraft = TaskList.create(newSprint());

    expect(draft.sprint).toEqual({
      startDate: '2026-11-03',
      endDate: '2026-11-17',
      goal: SPRINT_14_GOAL,
    });
  });

  it('refuses a last day before the first', () => {
    expect(() =>
      TaskList.create(newSprint({ sprint: { startDate: '2026-11-17', endDate: '2026-11-03' } })),
    ).toThrow(SprintDatesInvalidError);
  });

  it('refuses a last day one day before the first', () => {
    expect(() =>
      TaskList.create(newSprint({ sprint: { startDate: '2026-11-03', endDate: '2026-11-02' } })),
    ).toThrow(SprintDatesInvalidError);
  });

  it('allows a sprint of a single day', () => {
    const draft: TaskListDraft = TaskList.create(
      newSprint({ sprint: { startDate: '2026-11-03', endDate: '2026-11-03' } }),
    );

    expect(draft.sprint).toEqual({ startDate: '2026-11-03', endDate: '2026-11-03', goal: null });
  });

  it('orders the dates across a month and a year', () => {
    expect(() =>
      TaskList.create(newSprint({ sprint: { startDate: '2027-01-02', endDate: '2026-12-31' } })),
    ).toThrow(SprintDatesInvalidError);
    expect(
      TaskList.create(newSprint({ sprint: { startDate: '2026-12-31', endDate: '2027-01-02' } }))
        .sprint,
    ).toMatchObject({ startDate: '2026-12-31', endDate: '2027-01-02' });
  });
});

describe('TaskList.create: a sprint date is a real calendar date', () => {
  it.each([
    ['30 February', '2026-02-30'],
    ['29 February of a common year', '2027-02-29'],
    ['29 February of 2100', '2100-02-29'],
    ['month 13', '2026-13-01'],
    ['month 0', '2026-00-10'],
    ['day 0', '2026-11-00'],
    ['31 November', '2026-11-31'],
    ['a day without its zero', '2026-11-3'],
    ['a text', 'next monday'],
    ['an empty text', ''],
    ['a date with a time', '2026-11-03T08:00:00Z'],
  ])('refuses %s as the first day', (_why: string, startDate: string) => {
    expect(() =>
      TaskList.create(newSprint({ sprint: { startDate, endDate: '2100-12-31' } })),
    ).toThrow(InvalidListError);
  });

  it('refuses an impossible last day', () => {
    expect(() =>
      TaskList.create(newSprint({ sprint: { startDate: '2026-11-03', endDate: '2026-11-31' } })),
    ).toThrow(InvalidListError);
  });

  it('is not a sprint-dates error: an impossible date is an invalid list', () => {
    expect(() =>
      TaskList.create(newSprint({ sprint: { startDate: '2026-02-30', endDate: '2026-01-01' } })),
    ).toThrow(InvalidListError);
  });

  it.each(['2028-02-29', '2000-02-29'])(
    'accepts 29 February of the leap year %s',
    (day: string) => {
      expect(
        TaskList.create(newSprint({ sprint: { startDate: day, endDate: day } })).sprint,
      ).toMatchObject({ startDate: day });
    },
  );
});

describe('TaskList.create: the sprint goal is trimmed and 300 characters at most', () => {
  it('trims the goal', () => {
    const draft: TaskListDraft = TaskList.create(
      newSprint({
        sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: `  ${SPRINT_14_GOAL} ` },
      }),
    );

    expect(draft.sprint?.goal).toBe(SPRINT_14_GOAL);
  });

  it('keeps no goal when it is left out, null, empty or made of spaces', () => {
    for (const goal of [undefined, null, '', '   ']) {
      const draft: TaskListDraft = TaskList.create(
        newSprint({
          sprint:
            goal === undefined
              ? { startDate: '2026-11-03', endDate: '2026-11-17' }
              : { startDate: '2026-11-03', endDate: '2026-11-17', goal },
        }),
      );

      expect(draft.sprint?.goal).toBeNull();
    }
  });

  it('accepts a goal of 300 characters and refuses one of 301', () => {
    const create = (goal: string): TaskListDraft =>
      TaskList.create(
        newSprint({ sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal } }),
      );

    expect(create('a'.repeat(300)).sprint?.goal).toHaveLength(300);
    expect(() => create('a'.repeat(301))).toThrow(InvalidListError);
  });
});

describe('TaskList.restore: a stored list is a state a creation or a change could have produced', () => {
  it('restores Sprint 14 unchanged', () => {
    expect(TaskList.restore(sprintState({ version: 3 })).snapshot).toEqual(
      sprintState({ version: 3 }),
    );
  });

  it.each([0, -1, 1.5, Number.NaN])('refuses the version %s', (version: number) => {
    expect(() => sprint14({ version })).toThrow(InvalidListError);
  });

  it('refuses a sprint that ends before it starts, as an invalid list', () => {
    expect(() =>
      sprint14({ sprint: { startDate: '2026-11-17', endDate: '2026-11-03', goal: null } }),
    ).toThrow(InvalidListError);
  });

  it('refuses a sprint goal that is not trimmed or is empty', () => {
    expect(() =>
      sprint14({ sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: ' Goal ' } }),
    ).toThrow(InvalidListError);
    expect(() =>
      sprint14({ sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: '' } }),
    ).toThrow(InvalidListError);
  });

  it('refuses a name that is not trimmed', () => {
    expect(() => backlog({ name: ' Backlog' })).toThrow(InvalidListError);
  });
});

describe('TaskList.update: a merge patch changes what it names and nothing else', () => {
  it('renames the list and trims its name', () => {
    const { list, changed }: TaskListUpdate = backlog().update({ name: ' Icebox ' });

    expect(changed).toEqual(['name']);
    expect(list.snapshot).toEqual(backlogState({ name: 'Icebox', version: 2 }));
  });

  it('puts back the default icon with null', () => {
    const { list, changed }: TaskListUpdate = backlog({ icon: 'flag' }).update({ icon: null });

    expect(changed).toEqual(['icon']);
    expect(list.snapshot.icon).toBeNull();
  });

  it('changes the color and refuses one the contract does not list', () => {
    expect(backlog().update({ color: 'vert' }).list.snapshot.color).toBe('vert');
    expect(() => backlog().update({ color: 'turquoise' as NewTaskList['color'] })).toThrow(
      InvalidListError,
    );
  });

  it('refuses an empty name', () => {
    expect(() => backlog().update({ name: '  ' })).toThrow(InvalidListError);
  });

  it('lists the changed members in the order of the contract', () => {
    const { changed }: TaskListUpdate = backlog().update({
      sprint: { startDate: '2026-11-03', endDate: '2026-11-17' },
      color: 'vert',
      icon: 'flag',
      name: 'Sprint 15',
    });

    expect(changed).toEqual(['name', 'icon', 'color', 'sprint']);
  });

  it('does not change the list it was called on', () => {
    const list: TaskList = sprint14();

    list.update({ name: 'Sprint 15', sprint: null });

    expect(list.snapshot).toEqual(sprintState());
  });
});

describe('TaskList.update: a change that changes nothing keeps the same instance and version', () => {
  it('returns the same list for an empty patch', () => {
    const list: TaskList = sprint14({ version: 4 });

    const update: TaskListUpdate = list.update({});

    expect(update.list).toBe(list);
    expect(update.changed).toEqual([]);
    expect(update.list.snapshot.version).toBe(4);
  });

  it('returns the same list when the patch sets the values the list already has', () => {
    const list: TaskList = sprint14();

    const update: TaskListUpdate = list.update({
      name: 'Sprint 14',
      icon: null,
      color: 'indigo',
      sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: SPRINT_14_GOAL },
    });

    expect(update.list).toBe(list);
    expect(update.changed).toEqual([]);
  });

  it('returns the same list when the patch repeats the dates and leaves the goal out', () => {
    const list: TaskList = sprint14();

    expect(list.update({ sprint: { startDate: '2026-11-03', endDate: '2026-11-17' } }).list).toBe(
      list,
    );
  });

  it('returns the same list when a list is made a list again', () => {
    const list: TaskList = backlog();

    expect(list.update({ sprint: null }).list).toBe(list);
  });
});

describe('TaskList.update: the dates of a sprint and its goal', () => {
  it('moves the dates and keeps the goal the patch leaves out', () => {
    const { list, changed }: TaskListUpdate = sprint14().update({
      sprint: { startDate: '2026-11-04', endDate: '2026-11-18' },
    });

    expect(changed).toEqual(['sprint']);
    expect(list.snapshot.sprint).toEqual({
      startDate: '2026-11-04',
      endDate: '2026-11-18',
      goal: SPRINT_14_GOAL,
    });
    expect(list.snapshot.version).toBe(2);
  });

  it('drops the goal when the patch sets it to null', () => {
    const { list, changed }: TaskListUpdate = sprint14().update({
      sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: null },
    });

    expect(changed).toEqual(['sprint']);
    expect(list.snapshot.sprint?.goal).toBeNull();
  });

  it('drops the goal when the patch sets it to an empty text', () => {
    const { list }: TaskListUpdate = sprint14().update({
      sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: '  ' },
    });

    expect(list.snapshot.sprint?.goal).toBeNull();
  });

  it('replaces the goal with the trimmed new one, 300 characters at most', () => {
    const { list }: TaskListUpdate = sprint14().update({
      sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: '  Livrer le SSO. ' },
    });

    expect(list.snapshot.sprint?.goal).toBe('Livrer le SSO.');
    expect(() =>
      sprint14().update({
        sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: 'a'.repeat(301) },
      }),
    ).toThrow(InvalidListError);
  });

  it('changes only the goal', () => {
    const { changed }: TaskListUpdate = sprint14().update({
      sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: 'Livrer le SSO.' },
    });

    expect(changed).toEqual(['sprint']);
  });

  it('drops the dates and the goal with sprint: null', () => {
    const { list, changed }: TaskListUpdate = sprint14().update({ sprint: null });

    expect(changed).toEqual(['sprint']);
    expect(list.snapshot.sprint).toBeNull();
    expect(list.snapshot.version).toBe(2);
  });

  it('keeps no goal when a list becomes a sprint without one', () => {
    const { list, changed }: TaskListUpdate = backlog().update({
      sprint: { startDate: '2026-11-03', endDate: '2026-11-17' },
    });

    expect(changed).toEqual(['sprint']);
    expect(list.snapshot.sprint).toEqual({
      startDate: '2026-11-03',
      endDate: '2026-11-17',
      goal: null,
    });
  });

  it('does not bring a dropped goal back when the list becomes a sprint again', () => {
    const asList: TaskList = sprint14().update({ sprint: null }).list;

    const { list }: TaskListUpdate = asList.update({
      sprint: { startDate: '2026-12-01', endDate: '2026-12-15' },
    });

    expect(list.snapshot.sprint?.goal).toBeNull();
  });

  it('refuses a last day before the first and leaves the list as it was', () => {
    const list: TaskList = sprint14();

    expect(() =>
      list.update({ sprint: { startDate: '2026-11-17', endDate: '2026-11-03' } }),
    ).toThrow(SprintDatesInvalidError);
    expect(list.snapshot).toEqual(sprintState());
  });

  it('allows a sprint of a single day', () => {
    const { list }: TaskListUpdate = sprint14().update({
      sprint: { startDate: '2026-11-10', endDate: '2026-11-10' },
    });

    expect(list.snapshot.sprint).toMatchObject({ startDate: '2026-11-10', endDate: '2026-11-10' });
  });

  it('refuses an impossible date as an invalid list', () => {
    expect(() =>
      sprint14().update({ sprint: { startDate: '2026-11-03', endDate: '2026-02-30' } }),
    ).toThrow(InvalidListError);
  });

  it('refuses the dates before applying the other members of the patch', () => {
    const list: TaskList = sprint14();

    expect(() =>
      list.update({
        name: 'Sprint 15',
        sprint: { startDate: '2026-11-17', endDate: '2026-11-03' },
      }),
    ).toThrow(SprintDatesInvalidError);
    expect(list.snapshot.name).toBe('Sprint 14');
  });
});
