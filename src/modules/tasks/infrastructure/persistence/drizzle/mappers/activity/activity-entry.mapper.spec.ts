import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../../../../domain/errors/task/invalid-task.error.js';
import {
  ATELIER_NORD,
  CAD_482,
  CAMILLE,
  CAMILLE_ACTOR,
  INES,
  NOW,
  SPRINT_14,
  priorityEntry,
} from '../../../../../domain/tasks.fixture.js';
import type { ActivityChange } from '../../../../../domain/value-objects/activity/activity-change.value-object.js';
import type { ActivityEntryState } from '../../../../../domain/value-objects/activity/activity-entry-state.value-object.js';
import { TASK_SERVICE_ACTOR } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import {
  toActivityDetail,
  toActivityEntry,
  toActivityEntryInsert,
} from './activity-entry.mapper.js';
import type { ActivityEntryRow } from './activity-entry.mapper.js';

/**
 * Builds the row `activity_entries` stores for an entry.
 *
 * @param entry - The entry.
 * @param overrides - Columns to replace.
 * @returns The row.
 */
function rowOf(
  entry: ActivityEntryState,
  overrides: Partial<ActivityEntryRow> = {},
): ActivityEntryRow {
  const row = {
    organizationId: entry.organizationId,
    id: entry.id,
    taskId: entry.taskId,
    listId: entry.listId,
    kind: entry.change.kind,
    actorType: entry.actor.type,
    actorId: entry.actor.id,
    occurredAt: entry.occurredAt,
    ...toActivityDetail(entry.change),
  };
  return Object.assign(row, overrides);
}

const CHANGES: readonly ActivityChange[] = [
  { kind: 'create' },
  { kind: 'status', status: { from: 'todo', to: 'progress' } },
  { kind: 'priority', priority: { from: 'moyenne', to: 'haute' } },
  { kind: 'due', dueDate: { from: null, to: '2026-11-12' } },
  { kind: 'due', dueDate: { from: '2026-11-12', to: '2026-11-19' } },
  { kind: 'due', dueDate: { from: '2026-11-19', to: null } },
  { kind: 'assign', assignee: { userId: INES, added: true } },
  { kind: 'assign', assignee: { userId: INES, added: false } },
];

describe('toActivityEntry: a stored row becomes the entry it stores', () => {
  it.each(CHANGES)('round-trips the entry of kind $kind through its columns', (change) => {
    const entry: ActivityEntryState = priorityEntry({ change });

    expect(toActivityEntry(rowOf(entry))).toEqual(entry);
  });

  it('keeps the system actor of a removed member', () => {
    const entry: ActivityEntryState = priorityEntry({
      actor: TASK_SERVICE_ACTOR,
      change: { kind: 'assign', assignee: { userId: INES, added: false } },
    });

    expect(toActivityEntry(rowOf(entry)).actor).toEqual({ type: 'system', id: 'task-service' });
  });

  it('refuses a stored kind outside the five kinds', () => {
    expect(() => toActivityEntry(rowOf(priorityEntry(), { kind: 'comment' }))).toThrow(
      'A stored activity kind is outside the kinds.',
    );
  });

  it('refuses a stored actor type outside the four types', () => {
    expect(() => toActivityEntry(rowOf(priorityEntry(), { actorType: 'robot' }))).toThrow(
      'A stored actor type is outside the actor types.',
    );
  });

  it('refuses a status entry without its statuses', () => {
    const entry: ActivityEntryState = priorityEntry({
      change: { kind: 'status', status: { from: 'todo', to: 'done' } },
    });

    expect(() => toActivityEntry(rowOf(entry, { statusTo: null }))).toThrow(
      'A stored status entry has no status.',
    );
  });

  it('refuses a priority entry without its priorities', () => {
    expect(() => toActivityEntry(rowOf(priorityEntry(), { priorityFrom: null }))).toThrow(
      'A stored priority entry has no priority.',
    );
  });

  it('refuses an assign entry without its assignee', () => {
    const entry: ActivityEntryState = priorityEntry({
      change: { kind: 'assign', assignee: { userId: INES, added: true } },
    });

    expect(() => toActivityEntry(rowOf(entry, { assigneeAdded: null }))).toThrow(
      'A stored assign entry has no assignee.',
    );
  });

  it('refuses a status or priority outside its set', () => {
    expect(() => toActivityEntry(rowOf(priorityEntry(), { priorityTo: 'critique' }))).toThrow(
      'A stored priority is outside the priorities.',
    );
  });

  it('refuses a due entry with the same date on both sides', () => {
    const entry: ActivityEntryState = priorityEntry({
      change: { kind: 'due', dueDate: { from: null, to: '2026-11-12' } },
    });

    expect(() => toActivityEntry(rowOf(entry, { dueFrom: '2026-11-12' }))).toThrow(
      InvalidTaskError,
    );
  });
});

describe('toActivityDetail: only the columns of the kind hold values', () => {
  it('leaves every column null for a creation', () => {
    expect(toActivityDetail({ kind: 'create' })).toEqual({
      statusFrom: null,
      statusTo: null,
      priorityFrom: null,
      priorityTo: null,
      dueFrom: null,
      dueTo: null,
      assigneeUserId: null,
      assigneeAdded: null,
    });
  });

  it('fills the due columns of a removed due date with a null end', () => {
    expect(toActivityDetail({ kind: 'due', dueDate: { from: '2026-11-12', to: null } })).toEqual({
      statusFrom: null,
      statusTo: null,
      priorityFrom: null,
      priorityTo: null,
      dueFrom: '2026-11-12',
      dueTo: null,
      assigneeUserId: null,
      assigneeAdded: null,
    });
  });
});

describe('toActivityEntryInsert: a draft becomes the columns of a new entry', () => {
  it('stores the actor, the list, the instant and the detail and leaves the id to PostgreSQL', () => {
    const insert = toActivityEntryInsert({
      organizationId: ATELIER_NORD,
      taskId: CAD_482,
      listId: SPRINT_14,
      actor: CAMILLE_ACTOR,
      occurredAt: NOW,
      change: { kind: 'assign', assignee: { userId: INES, added: true } },
    });

    expect(insert).toEqual({
      organizationId: ATELIER_NORD,
      taskId: CAD_482,
      listId: SPRINT_14,
      kind: 'assign',
      actorType: 'user',
      actorId: CAMILLE,
      occurredAt: NOW,
      statusFrom: null,
      statusTo: null,
      priorityFrom: null,
      priorityTo: null,
      dueFrom: null,
      dueTo: null,
      assigneeUserId: INES,
      assigneeAdded: true,
    });
    expect(insert).not.toHaveProperty('id');
  });
});
