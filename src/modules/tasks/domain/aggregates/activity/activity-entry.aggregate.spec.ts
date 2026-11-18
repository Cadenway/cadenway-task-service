import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import {
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_490,
  CAMILLE,
  CAMILLE_ACTOR,
  HUGO,
  INES,
  NOW,
  SPRINT_14,
  priorityEntry,
  taskState,
} from '../../tasks.fixture.js';
import type { ActivityChange } from '../../value-objects/activity/activity-change.value-object.js';
import type { ActivityEntryDraft } from '../../value-objects/activity/activity-entry-draft.value-object.js';
import { TASK_SERVICE_ACTOR } from '../../value-objects/task/task-actor.value-object.js';
import { ActivityEntry } from './activity-entry.aggregate.js';

/**
 * Lists the changes of entries.
 *
 * @param drafts - The entries.
 * @returns Their changes.
 */
function changesOf(drafts: readonly ActivityEntryDraft[]): ActivityChange[] {
  return drafts.map((draft: ActivityEntryDraft): ActivityChange => draft.change);
}

describe('ActivityEntry.forCreation: one create entry per task created', () => {
  it('records the creation of CAD-482 in Sprint 14', () => {
    expect(ActivityEntry.forCreation(taskState(), CAMILLE_ACTOR, NOW)).toEqual({
      organizationId: ATELIER_NORD,
      taskId: CAD_482,
      listId: SPRINT_14,
      actor: CAMILLE_ACTOR,
      occurredAt: NOW,
      change: { kind: 'create' },
    });
  });

  it('refuses an actor without an id', () => {
    expect(() => ActivityEntry.forCreation(taskState(), { type: 'user', id: '' }, NOW)).toThrow(
      InvalidTaskError,
    );
  });
});

describe('ActivityEntry.forChange: status, priority, due date and assignees only', () => {
  it('records status, priority and due changes in that order, with the list after the change', () => {
    const drafts: readonly ActivityEntryDraft[] = ActivityEntry.forChange(
      taskState(),
      taskState({
        status: 'review',
        priority: 'urgente',
        dueDate: '2026-11-19',
        startDate: '2026-11-18',
        listId: BUGS,
      }),
      CAMILLE_ACTOR,
      NOW,
    );

    expect(changesOf(drafts)).toEqual([
      { kind: 'status', status: { from: 'progress', to: 'review' } },
      { kind: 'priority', priority: { from: 'haute', to: 'urgente' } },
      { kind: 'due', dueDate: { from: '2026-11-12', to: '2026-11-19' } },
    ]);
    expect(drafts.every((draft: ActivityEntryDraft): boolean => draft.listId === BUGS)).toBe(true);
  });

  it('records a due date set and removed with null on the other side', () => {
    expect(
      changesOf(
        ActivityEntry.forChange(
          taskState({ dueDate: null, startDate: null }),
          taskState({ startDate: null }),
          CAMILLE_ACTOR,
          NOW,
        ),
      ),
    ).toEqual([{ kind: 'due', dueDate: { from: null, to: '2026-11-12' } }]);
    expect(
      changesOf(
        ActivityEntry.forChange(
          taskState(),
          taskState({ dueDate: null, startDate: null }),
          CAMILLE_ACTOR,
          NOW,
        ),
      ),
    ).toEqual([{ kind: 'due', dueDate: { from: '2026-11-12', to: null } }]);
  });

  it('records each account added and removed', () => {
    expect(
      changesOf(
        ActivityEntry.forChange(
          taskState(),
          taskState({ assigneeIds: [CAMILLE, INES, HUGO] }),
          CAMILLE_ACTOR,
          NOW,
        ),
      ),
    ).toEqual([{ kind: 'assign', assignee: { userId: HUGO, added: true } }]);
    const removal: readonly ActivityEntryDraft[] = ActivityEntry.forChange(
      taskState(),
      taskState({ assigneeIds: [CAMILLE] }),
      TASK_SERVICE_ACTOR,
      NOW,
    );

    expect(changesOf(removal)).toEqual([
      { kind: 'assign', assignee: { userId: INES, added: false } },
    ]);
    expect(removal[0]?.actor).toEqual({ type: 'system', id: 'task-service' });
  });

  it('records nothing for the name, description, labels, estimate, start, list, parent or checklist', () => {
    expect(
      ActivityEntry.forChange(
        taskState(),
        taskState({
          name: 'Refondre la connexion SSO',
          description: null,
          labels: ['Auth'],
          estimateMinutes: 60,
          startDate: '2026-11-10',
          listId: BUGS,
          checklist: [],
        }),
        CAMILLE_ACTOR,
        NOW,
      ),
    ).toEqual([]);
  });

  it('refuses two states of different tasks', () => {
    expect(() =>
      ActivityEntry.forChange(taskState(), taskState({ id: CAD_490 }), CAMILLE_ACTOR, NOW),
    ).toThrow(InvalidTaskError);
  });
});

describe('ActivityEntry.restore: a stored entry has exactly the member of its kind', () => {
  it('restores a priority entry', () => {
    expect(ActivityEntry.restore(priorityEntry()).snapshot).toEqual(priorityEntry());
  });

  it.each<[string, ActivityChange]>([
    [
      'a status entry with the same from and to',
      { kind: 'status', status: { from: 'todo', to: 'todo' } },
    ],
    [
      'a priority entry with the same from and to',
      { kind: 'priority', priority: { from: 'haute', to: 'haute' } },
    ],
    ['a due entry with two null dates', { kind: 'due', dueDate: { from: null, to: null } }],
    [
      'a due entry with an invalid date',
      { kind: 'due', dueDate: { from: null, to: '2026-02-30' } },
    ],
    [
      'an assign entry without an account',
      { kind: 'assign', assignee: { userId: '', added: true } },
    ],
    ['an unknown kind', { kind: 'comment' } as unknown as ActivityChange],
  ])('refuses %s', (_case: string, change: ActivityChange) => {
    expect(() => ActivityEntry.restore(priorityEntry({ change }))).toThrow(InvalidTaskError);
  });

  it('refuses an entry without an id or with an unknown actor type', () => {
    expect(() => ActivityEntry.restore(priorityEntry({ id: '' }))).toThrow(InvalidTaskError);
    expect(() =>
      ActivityEntry.restore(priorityEntry({ actor: { type: 'robot' as 'user', id: CAMILLE } })),
    ).toThrow(InvalidTaskError);
  });
});
