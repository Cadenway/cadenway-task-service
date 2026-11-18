import { describe, expect, it } from 'vitest';

import { ParentInvalidError } from '../../errors/subtask/parent-invalid.error.js';
import { SubtaskDepthExceededError } from '../../errors/subtask/subtask-depth-exceeded.error.js';
import { SubtaskLimitReachedError } from '../../errors/subtask/subtask-limit-reached.error.js';
import { AssigneeInvalidError } from '../../errors/task/assignee-invalid.error.js';
import { AssigneeLimitReachedError } from '../../errors/task/assignee-limit-reached.error.js';
import { CancelReasonRequiredError } from '../../errors/task/cancel-reason-required.error.js';
import { CancelReasonUnexpectedError } from '../../errors/task/cancel-reason-unexpected.error.js';
import { ChecklistItemNotFoundError } from '../../errors/task/checklist-item-not-found.error.js';
import { ChecklistLimitReachedError } from '../../errors/task/checklist-limit-reached.error.js';
import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { LabelLimitReachedError } from '../../errors/task/label-limit-reached.error.js';
import { ListInvalidError } from '../../errors/task/list-invalid.error.js';
import { StartDateInvalidError } from '../../errors/task/start-date-invalid.error.js';
import { StatusHiddenError } from '../../errors/task/status-hidden.error.js';
import {
  ALL_STATUSES,
  ATELIER_NORD,
  BUGS,
  BUGS_PLACEMENT,
  CAD_482,
  CAD_483,
  CAD_490,
  CAMILLE,
  CAMILLE_ACTOR,
  DESIGN,
  HUGO,
  INES,
  LEA,
  MAQUETTES,
  MAQUETTES_PLACEMENT,
  MAQUETTE_VALIDEE,
  NADIA,
  NOW,
  PRODUIT,
  RECETTE,
  SPRINT_14,
  SPRINT_14_PLACEMENT,
  STRANGER,
  cad482,
  cad482Parent,
  cad490State,
  candidate,
  newTask,
  statusesHiding,
  subtaskState,
  taskState,
} from '../../tasks.fixture.js';
import type { SubtreeShape } from '../../value-objects/subtask/subtree-shape.value-object.js';
import type { ChecklistItemDraft } from '../../value-objects/task/checklist-item-draft.value-object.js';
import type { TaskDraft } from '../../value-objects/task/task-draft.value-object.js';
import { TaskKey } from '../../value-objects/task/task-key.value-object.js';
import type { TaskState } from '../../value-objects/task/task-state.value-object.js';
import type { TaskUpdate } from '../../value-objects/task/task-update.value-object.js';
import { Task } from './task.aggregate.js';

/**
 * Builds distinct accounts of Atelier Nord.
 *
 * @param count - How many.
 * @returns The accounts.
 */
function accounts(count: number): string[] {
  return Array.from(
    { length: count },
    (_: unknown, index: number): string =>
      `019a5f3c-0000-7000-8000-${String(index).padStart(12, '0')}`,
  );
}

/**
 * Builds distinct labels.
 *
 * @param count - How many.
 * @returns The labels.
 */
function labels(count: number): string[] {
  return Array.from(
    { length: count },
    (_: unknown, index: number): string => `Label ${String(index)}`,
  );
}

/**
 * Builds a checklist of unticked items.
 *
 * @param count - How many.
 * @returns The items.
 */
function checklist(count: number): TaskState['checklist'] {
  return Array.from({ length: count }, (_: unknown, index: number) => ({
    id: `019a7300-0000-7000-8000-${String(index).padStart(12, '0')}`,
    text: `Étape ${String(index)}`,
    done: false,
    position: index,
  }));
}

/**
 * Captures the error a call throws.
 *
 * @param call - The call.
 * @returns The error, or `undefined`.
 */
function errorOf(call: () => unknown): unknown {
  try {
    call();
  } catch (caught: unknown) {
    return caught;
  }
  return undefined;
}

/**
 * The subtree of CAD-490 alone.
 *
 * @param overrides - Fields to replace.
 * @returns The subtree.
 */
function cad490Subtree(overrides: Partial<SubtreeShape> = {}): SubtreeShape {
  return { taskId: CAD_490, descendantIds: [], height: 1, ...overrides };
}

/**
 * Asserts that a change committed and returns the task after it.
 *
 * @param update - The result of the change.
 * @param version - The expected version.
 * @returns The state after the change.
 */
function committed(update: TaskUpdate, version: number): TaskState {
  expect(update.task.snapshot.version).toBe(version);
  expect(update.task.snapshot.updatedAt).toBe(NOW);
  return update.task.snapshot;
}

describe('Task.create: a new task in a list the caller sees', () => {
  it('normalizes the name, labels and assignees and keeps the description as sent', () => {
    const draft: TaskDraft = Task.create(
      newTask({
        name: '  Configurer le domaine vérifié ',
        description: '  Markdown **gras**  ',
        labels: [' Auth', 'AUTH', 'Front', 'auth '],
        assignees: [
          candidate(CAMILLE, 'owner'),
          candidate(INES, 'admin'),
          candidate(CAMILLE, 'owner'),
        ],
        dueDate: '2026-11-12',
        startDate: '2026-11-11',
        estimateMinutes: 480,
      }),
      ALL_STATUSES,
      NOW,
    );

    expect(draft).toEqual({
      organizationId: ATELIER_NORD,
      spaceId: PRODUIT,
      listId: SPRINT_14,
      parentId: null,
      parentKey: null,
      name: 'Configurer le domaine vérifié',
      description: '  Markdown **gras**  ',
      status: 'todo',
      cancelReason: null,
      cancelNote: null,
      priority: 'moyenne',
      assigneeIds: [CAMILLE, INES],
      labels: ['Auth', 'Front'],
      dueDate: '2026-11-12',
      startDate: '2026-11-11',
      estimateMinutes: 480,
      completedAt: null,
      createdBy: CAMILLE_ACTOR,
    });
  });

  it('sets completedAt when the task is created done', () => {
    expect(Task.create(newTask({ status: 'done' }), ALL_STATUSES, NOW).completedAt).toBe(NOW);
  });

  it('creates a cancelled task with its reason and trimmed note', () => {
    const draft: TaskDraft = Task.create(
      newTask({
        status: 'cancelled',
        cancelReason: 'duplicate',
        cancelNote: ' Doublon de CAD-470 ',
      }),
      ALL_STATUSES,
      NOW,
    );

    expect([draft.cancelReason, draft.cancelNote]).toEqual(['duplicate', 'Doublon de CAD-470']);
  });

  it('refuses a status the space of the list no longer uses', () => {
    const error: unknown = errorOf(() =>
      Task.create(newTask({ status: 'triage' }), statusesHiding('triage'), NOW),
    );

    expect(error).toBeInstanceOf(StatusHiddenError);
    expect((error as StatusHiddenError).status).toBe('triage');
  });

  it('refuses cancelled without a reason, and a reason with another status', () => {
    expect(() => Task.create(newTask({ status: 'cancelled' }), ALL_STATUSES, NOW)).toThrow(
      CancelReasonRequiredError,
    );
    expect(() => Task.create(newTask({ cancelReason: 'scope' }), ALL_STATUSES, NOW)).toThrow(
      CancelReasonUnexpectedError,
    );
    expect(() => Task.create(newTask({ cancelNote: 'Hors V1' }), ALL_STATUSES, NOW)).toThrow(
      CancelReasonUnexpectedError,
    );
  });

  it('refuses a start without a due date or after it', () => {
    expect(() => Task.create(newTask({ startDate: '2026-11-11' }), ALL_STATUSES, NOW)).toThrow(
      StartDateInvalidError,
    );
    expect(() =>
      Task.create(newTask({ dueDate: '2026-11-10', startDate: '2026-11-11' }), ALL_STATUSES, NOW),
    ).toThrow(StartDateInvalidError);
  });

  it('refuses every account that is not a current member other than a guest, all at once', () => {
    const error: unknown = errorOf(() =>
      Task.create(
        newTask({
          assignees: [
            candidate(NADIA, 'guest'),
            candidate(CAMILLE, 'owner'),
            candidate(STRANGER, null),
          ],
        }),
        ALL_STATUSES,
        NOW,
      ),
    );

    expect(error).toBeInstanceOf(AssigneeInvalidError);
    expect((error as AssigneeInvalidError).userIds).toEqual([NADIA, STRANGER]);
  });

  it('answers in the order status, cancellation, dates, assignees', () => {
    expect(() =>
      Task.create(
        newTask({
          status: 'triage',
          cancelReason: 'scope',
          startDate: '2026-11-11',
          assignees: [candidate(NADIA, 'guest')],
        }),
        statusesHiding('triage'),
        NOW,
      ),
    ).toThrow(StatusHiddenError);
    expect(() =>
      Task.create(
        newTask({
          cancelReason: 'scope',
          startDate: '2026-11-11',
          assignees: [candidate(NADIA, 'guest')],
        }),
        ALL_STATUSES,
        NOW,
      ),
    ).toThrow(CancelReasonUnexpectedError);
    expect(() =>
      Task.create(
        newTask({ startDate: '2026-11-11', assignees: [candidate(NADIA, 'guest')] }),
        ALL_STATUSES,
        NOW,
      ),
    ).toThrow(StartDateInvalidError);
  });

  it('accepts 20 distinct assignees and labels, and refuses 21, which the request bounds refuse first', () => {
    const twenty: TaskDraft = Task.create(
      newTask({
        assignees: accounts(20).map((id: string) => candidate(id)),
        labels: labels(20),
      }),
      ALL_STATUSES,
      NOW,
    );

    expect(twenty.assigneeIds).toHaveLength(20);
    expect(twenty.labels).toHaveLength(20);
    expect(() =>
      Task.create(
        newTask({ assignees: accounts(21).map((id: string) => candidate(id)) }),
        ALL_STATUSES,
        NOW,
      ),
    ).toThrow(InvalidTaskError);
    expect(() => Task.create(newTask({ labels: labels(21) }), ALL_STATUSES, NOW)).toThrow(
      InvalidTaskError,
    );
  });

  it('refuses members the request bounds refuse', () => {
    expect(() => Task.create(newTask({ name: '   ' }), ALL_STATUSES, NOW)).toThrow(
      InvalidTaskError,
    );
    expect(() => Task.create(newTask({ name: 'a'.repeat(301) }), ALL_STATUSES, NOW)).toThrow(
      InvalidTaskError,
    );
    expect(Task.create(newTask({ name: 'a'.repeat(300) }), ALL_STATUSES, NOW).name).toHaveLength(
      300,
    );
    expect(() =>
      Task.create(newTask({ description: 'a'.repeat(50_001) }), ALL_STATUSES, NOW),
    ).toThrow(InvalidTaskError);
    expect(() => Task.create(newTask({ estimateMinutes: 0 }), ALL_STATUSES, NOW)).toThrow(
      InvalidTaskError,
    );
    expect(() => Task.create(newTask({ estimateMinutes: 60_001 }), ALL_STATUSES, NOW)).toThrow(
      InvalidTaskError,
    );
    expect(() => Task.create(newTask({ organizationId: '' }), ALL_STATUSES, NOW)).toThrow(
      InvalidTaskError,
    );
    expect(() => Task.create(newTask(), ALL_STATUSES, new Date(Number.NaN))).toThrow(
      InvalidTaskError,
    );
  });
});

describe('Task.create: a subtask takes the list of its parent, 3 levels and 25 subtasks at most', () => {
  it('creates a subtask of CAD-482 in Sprint 14', () => {
    const draft: TaskDraft = Task.create(newTask({ parent: cad482Parent() }), ALL_STATUSES, NOW);

    expect(draft.parentId).toBe(CAD_482);
    expect(draft.parentKey?.format()).toBe('CAD-482');
    expect(draft.listId).toBe(SPRINT_14);
  });

  it('accepts a sub-subtask and refuses a level 4', () => {
    expect(() =>
      Task.create(newTask({ parent: cad482Parent({ level: 2 }) }), ALL_STATUSES, NOW),
    ).not.toThrow();
    expect(() =>
      Task.create(newTask({ parent: cad482Parent({ level: 3 }) }), ALL_STATUSES, NOW),
    ).toThrow(SubtaskDepthExceededError);
  });

  it('accepts the 25th subtask and refuses the 26th', () => {
    expect(() =>
      Task.create(newTask({ parent: cad482Parent({ childCount: 24 }) }), ALL_STATUSES, NOW),
    ).not.toThrow();
    expect(() =>
      Task.create(newTask({ parent: cad482Parent({ childCount: 25 }) }), ALL_STATUSES, NOW),
    ).toThrow(SubtaskLimitReachedError);
  });

  it('refuses a subtask outside the list of its parent', () => {
    expect(() =>
      Task.create(
        newTask({ parent: cad482Parent(), placement: BUGS_PLACEMENT }),
        ALL_STATUSES,
        NOW,
      ),
    ).toThrow(InvalidTaskError);
  });
});

describe('Task.restore: a stored task keeps every invariant', () => {
  it('restores CAD-482', () => {
    expect(cad482().snapshot).toEqual(taskState());
  });

  it.each<[string, Partial<TaskState>]>([
    ['version 0', { version: 0 }],
    ['an untrimmed name', { name: ' Refondre ' }],
    ['a cancelled task without a reason', { status: 'cancelled' }],
    ['a reason on a task that is not cancelled', { cancelReason: 'scope' }],
    ['a note on a task that is not cancelled', { cancelNote: 'Note' }],
    ['an untrimmed note', { status: 'cancelled', cancelReason: 'scope', cancelNote: ' Note' }],
    ['a done task without completedAt', { status: 'done' }],
    ['completedAt on a task that is not done', { completedAt: NOW }],
    ['a start without a due date', { dueDate: null }],
    ['a start after the due date', { startDate: '2026-11-13' }],
    ['a parent id without a parent key', { parentId: CAD_490 }],
    ['the task as its own parent', { parentId: CAD_482, parentKey: TaskKey.of('CAD', 482) }],
    ['21 assignees', { assigneeIds: accounts(21) }],
    ['an assignee twice', { assigneeIds: [CAMILLE, CAMILLE] }],
    ['two labels that differ only by case', { labels: ['Auth', 'AUTH'] }],
    ['21 labels', { labels: labels(21) }],
    ['101 checklist items', { checklist: checklist(101) }],
    [
      'checklist positions out of order',
      {
        checklist: [
          { id: MAQUETTE_VALIDEE, text: 'Maquette validée', done: true, position: 1 },
          { id: RECETTE, text: 'Recette', done: false, position: 1 },
        ],
      },
    ],
    ['an unknown actor type', { createdBy: { type: 'robot' as 'user', id: CAMILLE } }],
  ])('refuses %s', (_case: string, overrides: Partial<TaskState>) => {
    expect(() => Task.restore(taskState(overrides))).toThrow(InvalidTaskError);
  });
});

describe('Task.update: a patch that changes nothing writes nothing', () => {
  it('keeps the same instance for an empty patch', () => {
    const task: Task = cad482();
    const update: TaskUpdate = task.update({}, ALL_STATUSES, NOW);

    expect(update.task).toBe(task);
    expect(update.changed).toEqual([]);
  });

  it('keeps the same instance when every value is the current one once normalized', () => {
    const task: Task = cad482();
    const update: TaskUpdate = task.update(
      {
        name: ' Refondre l’écran de connexion SSO ',
        status: 'progress',
        priority: 'haute',
        dueDate: '2026-11-12',
        estimateMinutes: 480,
        list: SPRINT_14_PLACEMENT,
        cancelReason: null,
      },
      ALL_STATUSES,
      NOW,
    );

    expect(update.task).toBe(task);
    expect(update.changed).toEqual([]);
  });
});

describe('Task.update: one version per committed change', () => {
  it('changes several members at once with a single version bump, changed in contract order', () => {
    const update: TaskUpdate = cad482().update(
      {
        priority: 'urgente',
        name: 'Refondre la connexion SSO',
        estimateMinutes: null,
        description: null,
      },
      ALL_STATUSES,
      NOW,
    );
    const after: TaskState = committed(update, 13);

    expect(update.changed).toEqual(['name', 'description', 'priority', 'estimateMinutes']);
    expect([after.name, after.priority, after.estimateMinutes, after.description]).toEqual([
      'Refondre la connexion SSO',
      'urgente',
      null,
      null,
    ]);
  });
});

describe('Task.update: status, cancellation and completion', () => {
  it('sets completedAt when the task enters done', () => {
    const update: TaskUpdate = cad482().update({ status: 'done' }, ALL_STATUSES, NOW);

    expect(update.changed).toEqual(['status']);
    expect(committed(update, 13).completedAt).toBe(NOW);
  });

  it('keeps completedAt from done to done and clears it when leaving done', () => {
    const doneAt: Date = new Date('2026-11-06T08:00:00.000Z');
    const done: Task = cad482({ status: 'done', completedAt: doneAt });

    expect(done.update({ status: 'done' }, ALL_STATUSES, NOW).task).toBe(done);
    expect(done.update({ priority: 'basse' }, ALL_STATUSES, NOW).task.snapshot.completedAt).toBe(
      doneAt,
    );
    expect(
      done.update({ status: 'review' }, ALL_STATUSES, NOW).task.snapshot.completedAt,
    ).toBeNull();
  });

  it('refuses a new status the space hides and keeps a hidden status the task has', () => {
    expect(() => cad482().update({ status: 'testing' }, statusesHiding('testing'), NOW)).toThrow(
      StatusHiddenError,
    );
    const testing: Task = cad482({ status: 'testing' });

    expect(
      testing.update({ status: 'testing', priority: 'basse' }, statusesHiding('testing'), NOW)
        .changed,
    ).toEqual(['priority']);
  });

  it('cancels with a reason and a note', () => {
    const update: TaskUpdate = cad482().update(
      { status: 'cancelled', cancelReason: 'duplicate', cancelNote: 'Doublon de CAD-470' },
      ALL_STATUSES,
      NOW,
    );

    expect(update.changed).toEqual(['status', 'cancelReason', 'cancelNote']);
  });

  it('refuses cancelled without a reason', () => {
    expect(() => cad482().update({ status: 'cancelled' }, ALL_STATUSES, NOW)).toThrow(
      CancelReasonRequiredError,
    );
  });

  it('refuses a reason for a task that is not cancelled after the patch', () => {
    expect(() => cad482().update({ cancelReason: 'scope' }, ALL_STATUSES, NOW)).toThrow(
      CancelReasonUnexpectedError,
    );
  });

  it('names cancelReason and cancelNote when leaving cancelled with a note', () => {
    const cancelled: Task = cad482({
      status: 'cancelled',
      cancelReason: 'wontdo',
      cancelNote: 'Abandonné',
    });
    const update: TaskUpdate = cancelled.update({ status: 'todo' }, ALL_STATUSES, NOW);

    expect(update.changed).toEqual(['status', 'cancelReason', 'cancelNote']);
    expect([update.task.snapshot.cancelReason, update.task.snapshot.cancelNote]).toEqual([
      null,
      null,
    ]);
  });

  it('names only cancelReason when leaving cancelled without a note', () => {
    const cancelled: Task = cad482({ status: 'cancelled', cancelReason: 'wontdo' });

    expect(cancelled.update({ status: 'todo' }, ALL_STATUSES, NOW).changed).toEqual([
      'status',
      'cancelReason',
    ]);
  });

  it('changes the reason of a cancelled task alone', () => {
    const cancelled: Task = cad482({ status: 'cancelled', cancelReason: 'wontdo' });

    expect(cancelled.update({ cancelReason: 'obsolete' }, ALL_STATUSES, NOW).changed).toEqual([
      'cancelReason',
    ]);
  });
});

describe('Task.update: the due date moves the start and keeps the duration', () => {
  it('shifts the start forward and names both dates', () => {
    const update: TaskUpdate = cad482().update({ dueDate: '2026-11-20' }, ALL_STATUSES, NOW);

    expect(update.changed).toEqual(['dueDate', 'startDate']);
    expect([update.task.snapshot.dueDate, update.task.snapshot.startDate]).toEqual([
      '2026-11-20',
      '2026-11-19',
    ]);
  });

  it('shifts the start backward', () => {
    const update: TaskUpdate = cad482().update({ dueDate: '2026-11-05' }, ALL_STATUSES, NOW);

    expect(update.task.snapshot.startDate).toBe('2026-11-04');
  });

  it('removes the start with the due date', () => {
    const update: TaskUpdate = cad482().update({ dueDate: null }, ALL_STATUSES, NOW);

    expect(update.changed).toEqual(['dueDate', 'startDate']);
    expect(update.task.snapshot.startDate).toBeNull();
  });

  it('refuses a shift below 0001-01-01', () => {
    expect(() =>
      cad482({ dueDate: '0001-01-05', startDate: '0001-01-01' }).update(
        { dueDate: '0001-01-04' },
        ALL_STATUSES,
        NOW,
      ),
    ).toThrow(StartDateInvalidError);
  });
});

describe('Task.update: moves within or across spaces', () => {
  it('moves a task to another list of its space with listId only', () => {
    const update: TaskUpdate = cad482().update({ list: BUGS_PLACEMENT }, ALL_STATUSES, NOW);

    expect(update.changed).toEqual(['listId']);
    expect(committed(update, 13).listId).toBe(BUGS);
  });

  it('moves a task to another space with listId and spaceId, keeping its key', () => {
    const update: TaskUpdate = cad482().update({ list: MAQUETTES_PLACEMENT }, ALL_STATUSES, NOW);

    expect(update.changed).toEqual(['listId', 'spaceId']);
    expect([update.task.snapshot.listId, update.task.snapshot.spaceId]).toEqual([
      MAQUETTES,
      DESIGN,
    ]);
    expect(update.task.snapshot.key.format()).toBe('CAD-482');
  });

  it('keeps a status the new space hides, but checks a new status against the new space', () => {
    const update: TaskUpdate = cad482().update(
      { list: MAQUETTES_PLACEMENT },
      statusesHiding('progress'),
      NOW,
    );

    expect(update.task.snapshot.status).toBe('progress');
    expect(() =>
      cad482().update(
        { list: MAQUETTES_PLACEMENT, status: 'review' },
        statusesHiding('review'),
        NOW,
      ),
    ).toThrow(StatusHiddenError);
  });

  it('detaches a subtask moved to another list', () => {
    const update: TaskUpdate = Task.restore(subtaskState()).update(
      { list: BUGS_PLACEMENT },
      ALL_STATUSES,
      NOW,
    );

    expect(update.changed).toEqual(['listId', 'parentKey']);
    expect([update.task.snapshot.parentId, update.task.snapshot.parentKey]).toEqual([null, null]);
  });

  it('moves nothing when a subtask is sent to its current list', () => {
    const subtask: Task = Task.restore(subtaskState());

    expect(subtask.update({ list: SPRINT_14_PLACEMENT }, ALL_STATUSES, NOW).task).toBe(subtask);
  });

  it('detaches a subtask with parentKey null and keeps its list', () => {
    const update: TaskUpdate = Task.restore(subtaskState()).update(
      { parent: null },
      ALL_STATUSES,
      NOW,
    );

    expect(update.changed).toEqual(['parentKey']);
    expect(update.task.snapshot.listId).toBe(SPRINT_14);
  });

  it('detaches nothing on a top-level task', () => {
    const task: Task = cad482();

    expect(task.update({ parent: null }, ALL_STATUSES, NOW).task).toBe(task);
  });

  it('moves and detaches together', () => {
    expect(
      Task.restore(subtaskState()).update(
        { list: MAQUETTES_PLACEMENT, parent: null },
        ALL_STATUSES,
        NOW,
      ).changed,
    ).toEqual(['listId', 'spaceId', 'parentKey']);
  });
});

describe('Task.update: attaching to a parent', () => {
  it('attaches CAD-490 to CAD-482 in the same list with parentKey only', () => {
    const update: TaskUpdate = Task.restore(cad490State()).update(
      { parent: { parent: cad482Parent(), subtree: cad490Subtree() } },
      ALL_STATUSES,
      NOW,
    );

    expect(update.changed).toEqual(['parentKey']);
    expect(update.task.snapshot.parentKey?.format()).toBe('CAD-482');
  });

  it('brings the task to the list and space of the parent', () => {
    const update: TaskUpdate = Task.restore(
      cad490State({ listId: MAQUETTES, spaceId: DESIGN }),
    ).update({ parent: { parent: cad482Parent(), subtree: cad490Subtree() } }, ALL_STATUSES, NOW);

    expect(update.changed).toEqual(['listId', 'spaceId', 'parentKey']);
    expect([update.task.snapshot.listId, update.task.snapshot.spaceId]).toEqual([
      SPRINT_14,
      PRODUIT,
    ]);
  });

  it('changes nothing when the parent is already the parent', () => {
    const subtask: Task = Task.restore(subtaskState());
    const update: TaskUpdate = subtask.update(
      {
        parent: {
          parent: cad482Parent({ childCount: 25 }),
          subtree: { taskId: CAD_483, descendantIds: [], height: 1 },
        },
      },
      ALL_STATUSES,
      NOW,
    );

    expect(update.task).toBe(subtask);
  });

  it('refuses a listId other than the list of the parent', () => {
    expect(() =>
      Task.restore(cad490State()).update(
        { parent: { parent: cad482Parent(), subtree: cad490Subtree() }, list: BUGS_PLACEMENT },
        ALL_STATUSES,
        NOW,
      ),
    ).toThrow(ListInvalidError);
  });

  it('refuses a descendant as parent with its key', () => {
    const error: unknown = errorOf(() =>
      cad482().update(
        {
          parent: {
            parent: { ...cad482Parent({ level: 2 }), id: CAD_483, key: TaskKey.of('CAD', 483) },
            subtree: { taskId: CAD_482, descendantIds: [CAD_483], height: 2 },
          },
        },
        ALL_STATUSES,
        NOW,
      ),
    );

    expect(error).toBeInstanceOf(ParentInvalidError);
    expect((error as ParentInvalidError).parentKey).toBe('CAD-483');
  });

  it('refuses a subtree that would reach level 4 and a parent with 25 subtasks', () => {
    expect(() =>
      Task.restore(cad490State()).update(
        { parent: { parent: cad482Parent({ level: 2 }), subtree: cad490Subtree({ height: 2 }) } },
        ALL_STATUSES,
        NOW,
      ),
    ).toThrow(SubtaskDepthExceededError);
    expect(() =>
      Task.restore(cad490State()).update(
        { parent: { parent: cad482Parent({ childCount: 25 }), subtree: cad490Subtree() } },
        ALL_STATUSES,
        NOW,
      ),
    ).toThrow(SubtaskLimitReachedError);
  });

  it('answers the placement before the status', () => {
    expect(() =>
      Task.restore(cad490State()).update(
        {
          parent: { parent: cad482Parent({ level: 3 }), subtree: cad490Subtree() },
          status: 'triage',
        },
        statusesHiding('triage'),
        NOW,
      ),
    ).toThrow(SubtaskDepthExceededError);
  });

  it('refuses a subtree that is not the one of the task', () => {
    expect(() =>
      cad482().update(
        { parent: { parent: cad482Parent(), subtree: cad490Subtree() } },
        ALL_STATUSES,
        NOW,
      ),
    ).toThrow(InvalidTaskError);
  });
});

describe('Task.followMove: a subtask follows the task that moved', () => {
  it('takes the new list with listId only in the same space', () => {
    const update: TaskUpdate = Task.restore(subtaskState()).followMove(BUGS_PLACEMENT, NOW);

    expect(update.changed).toEqual(['listId']);
    expect(committed(update, 2).parentKey?.format()).toBe('CAD-482');
  });

  it('takes the new list and space, keeping a status the new space hides', () => {
    const update: TaskUpdate = Task.restore(subtaskState({ status: 'review' })).followMove(
      MAQUETTES_PLACEMENT,
      NOW,
    );

    expect(update.changed).toEqual(['listId', 'spaceId']);
    expect(update.task.snapshot.status).toBe('review');
  });

  it('changes nothing when already there', () => {
    const subtask: Task = Task.restore(subtaskState());

    expect(subtask.followMove(SPRINT_14_PLACEMENT, NOW).task).toBe(subtask);
  });
});

describe('Task.assign: 20 assignees at most, current members other than guests', () => {
  it('adds a member after the others', () => {
    const update: TaskUpdate = cad482().assign(candidate(HUGO, 'member'), NOW);

    expect(update.changed).toEqual(['assigneeIds']);
    expect(committed(update, 13).assigneeIds).toEqual([CAMILLE, INES, HUGO]);
  });

  it('changes nothing for a person already assigned, even one who has become a guest', () => {
    const task: Task = cad482();

    expect(task.assign(candidate(INES, 'guest'), NOW).task).toBe(task);
    expect(task.assign(candidate(INES, null), NOW).changed).toEqual([]);
  });

  it('refuses a guest and a non-member with their account', () => {
    const guest: unknown = errorOf(() => cad482().assign(candidate(NADIA, 'guest'), NOW));

    expect(guest).toBeInstanceOf(AssigneeInvalidError);
    expect((guest as AssigneeInvalidError).userIds).toEqual([NADIA]);
    expect(() => cad482().assign(candidate(STRANGER, null), NOW)).toThrow(AssigneeInvalidError);
  });

  it('accepts the 20th assignee and refuses the 21st', () => {
    expect(
      cad482({ assigneeIds: accounts(19) }).assign(candidate(LEA), NOW).task.snapshot.assigneeIds,
    ).toHaveLength(20);
    expect(() => cad482({ assigneeIds: accounts(20) }).assign(candidate(LEA), NOW)).toThrow(
      AssigneeLimitReachedError,
    );
  });

  it('checks the membership before the limit, and an existing assignee before both', () => {
    const full: Task = cad482({ assigneeIds: accounts(20) });

    expect(() => full.assign(candidate(NADIA, 'guest'), NOW)).toThrow(AssigneeInvalidError);
    expect(full.assign(candidate(accounts(20)[0] ?? '', 'guest'), NOW).task).toBe(full);
  });
});

describe('Task.unassign: removes a person, the others keep their order', () => {
  it('removes an assignee', () => {
    const update: TaskUpdate = cad482({ assigneeIds: [CAMILLE, INES, HUGO] }).unassign(INES, NOW);

    expect(update.changed).toEqual(['assigneeIds']);
    expect(committed(update, 13).assigneeIds).toEqual([CAMILLE, HUGO]);
  });

  it('changes nothing for a person who is not assigned', () => {
    const task: Task = cad482();

    expect(task.unassign(HUGO, NOW).task).toBe(task);
  });
});

describe('Task labels: 20 at most, one label whatever its case', () => {
  it('adds a trimmed label after the others', () => {
    const update: TaskUpdate = cad482().addLabel('  Sécurité ', NOW);

    expect(update.changed).toEqual(['labels']);
    expect(committed(update, 13).labels).toEqual(['Auth', 'Front', 'Sécurité']);
  });

  it('changes nothing for a label the task has in another case', () => {
    const task: Task = cad482();

    expect(task.addLabel('AUTH', NOW).task).toBe(task);
  });

  it('accepts the 20th label and refuses the 21st, but not a duplicate at 20', () => {
    expect(cad482({ labels: labels(19) }).addLabel('Auth', NOW).task.snapshot.labels).toHaveLength(
      20,
    );
    expect(() => cad482({ labels: labels(20) }).addLabel('Auth', NOW)).toThrow(
      LabelLimitReachedError,
    );
    expect(cad482({ labels: labels(20) }).addLabel('label 3', NOW).changed).toEqual([]);
  });

  it('removes a label whatever its case', () => {
    const update: TaskUpdate = cad482().removeLabel(' front', NOW);

    expect(update.changed).toEqual(['labels']);
    expect(update.task.snapshot.labels).toEqual(['Auth']);
  });

  it('changes nothing when removing a label the task does not have', () => {
    const task: Task = cad482();

    expect(task.removeLabel('Back', NOW).task).toBe(task);
  });

  it('refuses a blank label', () => {
    expect(() => cad482().addLabel('  ', NOW)).toThrow(InvalidTaskError);
  });
});

describe('Task checklist: 100 items, added unticked at the end, ticked or unticked', () => {
  it('drafts an unticked item after the last one without changing the task', () => {
    const task: Task = cad482();
    const draft: ChecklistItemDraft = task.draftChecklistItem('  Revue de sécurité ');

    expect(draft).toEqual({ text: 'Revue de sécurité', done: false, position: 2 });
    expect(task.snapshot.checklist).toHaveLength(2);
    expect(cad482({ checklist: [] }).draftChecklistItem('Première étape').position).toBe(0);
  });

  it('accepts the 100th item and refuses the 101st', () => {
    expect(cad482({ checklist: checklist(99) }).draftChecklistItem('Dernière').position).toBe(99);
    expect(() => cad482({ checklist: checklist(100) }).draftChecklistItem('De trop')).toThrow(
      ChecklistLimitReachedError,
    );
  });

  it('appends the stored item with a new version', () => {
    const task: Task = cad482();
    const draft: ChecklistItemDraft = task.draftChecklistItem('Revue de sécurité');
    const update: TaskUpdate = task.addChecklistItem(
      { id: '019a7300-0000-7000-8000-000000000003', ...draft },
      NOW,
    );

    expect(update.changed).toEqual(['checklist']);
    expect(committed(update, 13).checklist.map((item) => item.text)).toEqual([
      'Maquette validée',
      'Recette en préproduction',
      'Revue de sécurité',
    ]);
  });

  it('refuses an item that is not a draft of this checklist', () => {
    const id: string = '019a7300-0000-7000-8000-000000000003';

    expect(() =>
      cad482().addChecklistItem({ id, text: 'Revue', done: true, position: 2 }, NOW),
    ).toThrow(InvalidTaskError);
    expect(() =>
      cad482().addChecklistItem({ id, text: 'Revue', done: false, position: 1 }, NOW),
    ).toThrow(InvalidTaskError);
    expect(() =>
      cad482().addChecklistItem({ id: RECETTE, text: 'Revue', done: false, position: 2 }, NOW),
    ).toThrow(InvalidTaskError);
    expect(() =>
      cad482({ checklist: checklist(100) }).addChecklistItem(
        { id, text: 'Revue', done: false, position: 100 },
        NOW,
      ),
    ).toThrow(ChecklistLimitReachedError);
  });

  it('ticks and unticks an item', () => {
    const ticked: TaskUpdate = cad482().setChecklistItemDone(RECETTE, true, NOW);
    const unticked: TaskUpdate = cad482().setChecklistItemDone(MAQUETTE_VALIDEE, false, NOW);

    expect(ticked.changed).toEqual(['checklist']);
    expect(committed(ticked, 13).checklist.map((item) => item.done)).toEqual([true, true]);
    expect(unticked.task.snapshot.checklist.map((item) => item.done)).toEqual([false, false]);
  });

  it('changes nothing for the same state', () => {
    const task: Task = cad482();

    expect(task.setChecklistItemDone(MAQUETTE_VALIDEE, true, NOW).task).toBe(task);
  });

  it('refuses an item the checklist does not hold', () => {
    const error: unknown = errorOf(() =>
      cad482().setChecklistItemDone('019a7300-0000-7000-8000-000000000999', true, NOW),
    );

    expect(error).toBeInstanceOf(ChecklistItemNotFoundError);
    expect((error as ChecklistItemNotFoundError).checklistItemId).toBe(
      '019a7300-0000-7000-8000-000000000999',
    );
  });
});

describe('Task.asParent: the task as the parent of a subtask', () => {
  it('names the task, its list, its level and its subtask count', () => {
    expect(cad482().asParent(1, 2)).toEqual({
      id: CAD_482,
      key: TaskKey.of('CAD', 482),
      listId: SPRINT_14,
      spaceId: PRODUIT,
      level: 1,
      childCount: 2,
    });
  });
});
