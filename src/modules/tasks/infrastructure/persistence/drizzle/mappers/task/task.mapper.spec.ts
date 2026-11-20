import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../../../../domain/errors/task/invalid-task.error.js';
import {
  ALL_STATUSES,
  ATELIER_NORD,
  CAD_482,
  CAD_483,
  CAMILLE,
  CAMILLE_ACTOR,
  CREATED_AT,
  INES,
  NOW,
  PRODUIT,
  SPRINT_14,
  cad482,
  subtaskState,
  taskState,
  archiveFrom,
  trashIn,
} from '../../../../../domain/tasks.fixture.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import { toTask, toTaskInsert, toTaskUpdate } from './task.mapper.js';
import type { TaskRow } from './task.mapper.js';
import { toChecklistItem } from './checklist-item.mapper.js';
import { toTaskReference, toTaskSummary } from './task-summary.mapper.js';

/**
 * Builds the row `tasks` stores for a state.
 *
 * @param state - The state.
 * @param overrides - Columns to replace.
 * @returns The row.
 */
function rowOf(state: TaskState, overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    organizationId: state.organizationId,
    id: state.id,
    keyPrefix: state.key.prefix,
    keyNumber: state.key.number,
    spaceId: state.spaceId,
    listId: state.listId,
    parentId: state.parentId,
    name: state.name,
    description: state.description,
    descriptionMentions: null,
    status: state.status,
    cancelReason: state.cancelReason,
    cancelNote: state.cancelNote,
    priority: state.priority,
    dueDate: state.dueDate,
    startDate: state.startDate,
    estimateMinutes: state.estimateMinutes,
    completedAt: state.completedAt,
    createdAt: state.createdAt,
    createdByType: state.createdBy.type,
    createdById: state.createdBy.id,
    updatedAt: state.updatedAt,
    version: state.version,
    archivedAt: state.archive?.at ?? null,
    archivedByType: state.archive?.by.type ?? null,
    archivedById: state.archive?.by.id ?? null,
    archiveRootId: state.archive?.rootId ?? null,
    archiveRoot: state.archive?.rootId === state.id,
    trashEntryId: state.trash?.entryId ?? null,
    ...overrides,
  };
}

describe('toTask: a stored row becomes the task it stores', () => {
  it('restores CAD-482 with its assignees, labels and checklist in order', () => {
    const state: TaskState = taskState();
    const task = toTask(rowOf(state), null, state.assigneeIds, state.labels, state.checklist);

    expect(task.snapshot).toEqual(state);
  });

  it('ignores stale spans from before a legacy writer replaced the description', () => {
    const original = cad482();
    const edit = original.update(
      {
        description: '@Inès',
        descriptionMentions: [{ userId: INES, start: 0, end: 5 }],
      },
      ALL_STATUSES,
      NOW,
    );
    const written = rowOf(edit.task.snapshot, toTaskUpdate(edit.task));

    expect(toTask(written, null, [], [], []).snapshot.descriptionMentions).toEqual([
      { userId: INES, start: 0, end: 5 },
    ]);
    expect(
      toTask({ ...written, description: '@Jean' }, null, [], [], []).snapshot.descriptionMentions,
    ).toEqual([]);
  });

  it('restores a subtask with the key of its parent', () => {
    const state: TaskState = subtaskState();
    const task = toTask(rowOf(state), state.parentKey, state.assigneeIds, [], []);

    expect(task.snapshot.parentId).toBe(CAD_482);
    expect(task.snapshot.parentKey?.format()).toBe('CAD-482');
    expect(task.snapshot.key.format()).toBe('CAD-483');
  });

  it('restores a cancelled task with its reason and note, and a done task with its completion', () => {
    const cancelled: TaskState = taskState({
      status: 'cancelled',
      cancelReason: 'duplicate',
      cancelNote: 'Doublon de CAD-490',
    });
    const done: TaskState = taskState({ status: 'done', completedAt: NOW });

    expect(toTask(rowOf(cancelled), null, [], [], []).snapshot).toMatchObject({
      status: 'cancelled',
      cancelReason: 'duplicate',
      cancelNote: 'Doublon de CAD-490',
    });
    expect(toTask(rowOf(done), null, [], [], []).snapshot.completedAt).toEqual(NOW);
  });

  it('keeps the dates as calendar strings, down to the first year', () => {
    const state: TaskState = taskState({ dueDate: '0001-01-01', startDate: null });

    expect(toTask(rowOf(state), null, [], [], []).snapshot.dueDate).toBe('0001-01-01');
  });

  it('refuses a stored status outside the ten keys', () => {
    expect(() => toTask(rowOf(taskState(), { status: 'archived' }), null, [], [], [])).toThrow(
      'A stored status is outside the status keys (task 019a7200-0000-7000-8000-000000000482)',
    );
  });

  it('refuses a stored priority outside the four priorities', () => {
    expect(() => toTask(rowOf(taskState(), { priority: 'critique' }), null, [], [], [])).toThrow(
      'A stored priority is outside the priorities (task 019a7200-0000-7000-8000-000000000482)',
    );
  });

  it('refuses a stored cancel reason outside the four reasons', () => {
    const state: TaskState = taskState({ status: 'cancelled', cancelReason: 'duplicate' });

    expect(() => toTask(rowOf(state, { cancelReason: 'boredom' }), null, [], [], [])).toThrow(
      'A stored cancel reason is outside the cancel reasons (task 019a7200-0000-7000-8000-000000000482)',
    );
  });

  it('refuses a stored creator type outside the four actor types', () => {
    expect(() => toTask(rowOf(taskState(), { createdByType: 'robot' }), null, [], [], [])).toThrow(
      'A stored actor type is outside the actor types (task 019a7200-0000-7000-8000-000000000482)',
    );
  });

  it('refuses a task with a parent id and no parent key', () => {
    const state: TaskState = subtaskState();

    expect(() => toTask(rowOf(state), null, [], [], [])).toThrow(InvalidTaskError);
  });

  it('refuses a stored key that is not a key', () => {
    expect(() => toTask(rowOf(taskState(), { keyPrefix: 'cad' }), null, [], [], [])).toThrow(
      InvalidTaskError,
    );
    expect(() => toTask(rowOf(taskState(), { keyNumber: 0 }), null, [], [], [])).toThrow(
      InvalidTaskError,
    );
  });

  it('restores the archive of an archived task, null for a live one', () => {
    const archived: TaskState = taskState({ archive: archiveFrom(CAD_482), version: 13 });

    expect(toTask(rowOf(archived), null, [], [], []).snapshot.archive).toEqual(
      archiveFrom(CAD_482),
    );
    expect(toTask(rowOf(taskState()), null, [], [], []).snapshot.archive).toBeNull();
  });

  it('refuses an archive stored in part only, or by an actor type outside the four', () => {
    const archived: TaskState = taskState({ archive: archiveFrom(CAD_482) });

    expect(() => toTask(rowOf(archived, { archiveRootId: null }), null, [], [], [])).toThrow(
      'A stored archive is set in part only (task 019a7200-0000-7000-8000-000000000482)',
    );
    expect(() => toTask(rowOf(archived, { archivedByType: 'robot' }), null, [], [], [])).toThrow(
      'A stored actor type is outside the actor types',
    );
  });

  it('restores the trash entry of a task in the trash, null for one that is not', () => {
    const trashed: TaskState = taskState({ trash: trashIn(), version: 13 });

    expect(toTask(rowOf(trashed), null, [], [], []).snapshot.trash).toEqual(trashIn());
    expect(toTask(rowOf(taskState()), null, [], [], []).snapshot.trash).toBeNull();
  });

  it('maps an archived task in the trash with its archive and its entry', () => {
    const archived: TaskState = taskState({ archive: archiveFrom(CAD_482) });
    const { snapshot } = toTask(
      rowOf(archived, { trashEntryId: trashIn().entryId }),
      null,
      [],
      [],
      [],
    );

    expect(snapshot.archive).toEqual(archiveFrom(CAD_482));
    expect(snapshot.trash).toEqual({ entryId: trashIn().entryId });
  });

  it('refuses a done task stored without its completion instant', () => {
    const state: TaskState = taskState({ status: 'done', completedAt: NOW });

    expect(() => toTask(rowOf(state, { completedAt: null }), null, [], [], [])).toThrow(
      InvalidTaskError,
    );
  });
});

describe('toTaskInsert: a draft becomes the columns of a new task', () => {
  it('stores the key on the task and leaves the id, the instants and the version to PostgreSQL', () => {
    const state: TaskState = taskState({ assigneeIds: [], labels: [], checklist: [] });
    const insert = toTaskInsert(state, TaskKey.of('CAD', 495));

    expect(insert).toMatchObject({
      organizationId: ATELIER_NORD,
      keyPrefix: 'CAD',
      keyNumber: 495,
      spaceId: PRODUIT,
      listId: SPRINT_14,
      parentId: null,
      status: 'progress',
      priority: 'haute',
      dueDate: '2026-11-12',
      startDate: '2026-11-11',
      estimateMinutes: 480,
      createdByType: 'user',
      createdById: CAMILLE,
    });
    expect(insert).not.toHaveProperty('id');
    expect(insert).not.toHaveProperty('createdAt');
    expect(insert).not.toHaveProperty('updatedAt');
    expect(insert).not.toHaveProperty('version');
  });

  it('round-trips through a stored row', () => {
    const state: TaskState = subtaskState({ status: 'done', completedAt: NOW });
    const insert = toTaskInsert(state, state.key);
    const stored: TaskRow = {
      ...rowOf(state),
      ...insert,
      id: CAD_483,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      version: 1,
    };

    const restored = toTask(stored, state.parentKey, state.assigneeIds, state.labels, []);

    expect(restored.snapshot).toEqual({ ...state, updatedAt: CREATED_AT, version: 1 });
  });
});

describe('toTaskUpdate: a changed task becomes the columns to write', () => {
  it('writes the members a change can touch with the version and instant of the change', () => {
    const before = cad482();
    const after = before.update({ priority: 'urgente', status: 'review' }, ALL_STATUSES, NOW).task;

    const set = toTaskUpdate(after);

    expect(set).toMatchObject({
      status: 'review',
      priority: 'urgente',
      version: 13,
      updatedAt: NOW,
      listId: SPRINT_14,
      spaceId: PRODUIT,
    });
  });

  it('never writes the key, the organization, the id, the creation, the archive or the trash', () => {
    const set = toTaskUpdate(cad482());

    for (const column of [
      'organizationId',
      'id',
      'keyPrefix',
      'keyNumber',
      'createdAt',
      'createdByType',
      'createdById',
      'archivedAt',
      'archivedByType',
      'archivedById',
      'archiveRootId',
      'archiveRoot',
      'trashEntryId',
    ]) {
      expect(set).not.toHaveProperty(column);
    }
  });
});

describe('toChecklistItem and the summaries', () => {
  it('maps a checklist row to its item', () => {
    expect(
      toChecklistItem({
        organizationId: ATELIER_NORD,
        id: CAD_483,
        taskId: CAD_482,
        text: 'Recette en préproduction',
        done: true,
        position: 3,
        createdAt: CREATED_AT,
      }),
    ).toEqual({ id: CAD_483, text: 'Recette en préproduction', done: true, position: 3 });
  });

  it('builds the summary of a subtask without its description, note or checklist', () => {
    const state: TaskState = subtaskState();
    const summary = toTaskSummary(
      rowOf(state),
      'CAD-482',
      [CAMILLE, INES],
      ['Auth'],
      { total: 0, closed: 0 },
      { total: 2, done: 1 },
    );

    expect(summary).toMatchObject({
      id: CAD_483,
      key: 'CAD-483',
      parentKey: 'CAD-482',
      assigneeIds: [CAMILLE, INES],
      labels: ['Auth'],
      subtaskCounts: { total: 0, closed: 0 },
      checklistCounts: { total: 2, done: 1 },
      listId: SPRINT_14,
      spaceId: PRODUIT,
      version: 1,
    });
    expect(summary).not.toHaveProperty('description');
    expect(summary).not.toHaveProperty('cancelNote');
  });

  it('refuses a summary row with a stored status outside the ten keys', () => {
    expect(() =>
      toTaskSummary(
        rowOf(taskState(), { status: 'archived' }),
        null,
        [],
        [],
        { total: 0, closed: 0 },
        { total: 0, done: 0 },
      ),
    ).toThrow(
      'A stored status is outside the status keys (task 019a7200-0000-7000-8000-000000000482)',
    );
  });

  it('builds a reference with the key, the name and the status as they are now', () => {
    expect(
      toTaskReference({
        keyPrefix: 'CAD',
        keyNumber: 482,
        name: 'Refondre l’écran de connexion SSO',
        status: 'progress',
      }),
    ).toEqual({
      key: 'CAD-482',
      name: 'Refondre l’écran de connexion SSO',
      status: 'progress',
    });
  });

  it('keeps CAMILLE_ACTOR as the creator of a restored task', () => {
    expect(toTask(rowOf(taskState()), null, [], [], []).snapshot.createdBy).toEqual(CAMILLE_ACTOR);
  });
});
