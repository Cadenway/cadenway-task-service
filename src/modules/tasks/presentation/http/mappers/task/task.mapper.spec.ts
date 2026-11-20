import {
  CreateTaskInternalResponse,
  ListSubtasksInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import type { TaskSummaryView } from '../../../../application/projections/task/task-summary.projection.js';
import type { TaskView } from '../../../../application/projections/task/task-view.projection.js';
import { toTaskRef } from './task-reference.mapper.js';
import { toTaskSummary } from './task-summary.mapper.js';
import { toTask } from './task.mapper.js';

/** Camille Martin (CM), a member of Atelier Nord. */
const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';
/** Hugo Dubois (HD), a member of Atelier Nord. */
const HUGO = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32';

/** CAD-482 as the use cases return it. */
const CAD_482: TaskView = {
  id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
  key: 'CAD-482',
  name: 'Ajouter la connexion par lien magique',
  status: 'progress',
  cancelReason: null,
  description: '## Contexte',
  descriptionMentions: [],
  cancelNote: null,
  priority: 'haute',
  assigneeIds: [CAMILLE, HUGO],
  dueDate: '2026-11-20',
  startDate: '2026-11-17',
  estimateMinutes: 480,
  labels: ['Sécurité', 'auth'],
  parentKey: null,
  listId: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02',
  spaceId: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b03',
  subtaskCounts: { total: 2, closed: 1 },
  checklistCounts: { total: 2, done: 1 },
  completedAt: null,
  createdAt: new Date('2026-11-16T09:00:00.000Z'),
  version: 4,
  checklist: [
    { id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b04', text: 'Relire les messages', done: true },
    { id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b05', text: 'Tester le lien expiré', done: false },
  ],
  createdBy: { type: 'user', id: CAMILLE },
  updatedAt: new Date('2026-11-18T10:15:30.123Z'),
  archivedAt: null,
  archivedBy: null,
};

describe('toTask', () => {
  it('answers a task the response validator of the contract accepts', () => {
    expect(() => CreateTaskInternalResponse.parse(toTask(CAD_482))).not.toThrow();
  });

  it('maps the assignees as accounts in the order of the assignment, and the instants to ISO 8601', () => {
    const task = toTask(CAD_482);

    expect(task.assignees).toEqual([{ userId: CAMILLE }, { userId: HUGO }]);
    expect(task.createdAt).toBe('2026-11-16T09:00:00.000Z');
    expect(task.updatedAt).toBe('2026-11-18T10:15:30.123Z');
    expect(task.completedAt).toBeNull();
    expect(task.createdBy).toEqual({ type: 'user', id: CAMILLE });
    expect(task.version).toBe(4);
  });

  it('always carries archivedAt and archivedBy, null for a live task', () => {
    expect(toTask(CAD_482)).toMatchObject({ archivedAt: null, archivedBy: null });
  });

  it('carries the archive of an archived task, which the contract accepts', () => {
    const task = toTask({
      ...CAD_482,
      archivedAt: new Date('2026-11-05T11:30:00.000Z'),
      archivedBy: { type: 'user', id: HUGO },
    });

    expect(task).toMatchObject({
      archivedAt: '2026-11-05T11:30:00.000Z',
      archivedBy: { type: 'user', id: HUGO },
    });
    expect(() => CreateTaskInternalResponse.parse(task)).not.toThrow();
  });

  it('keeps the labels and the checklist in their order and drops the internal id', () => {
    const task = toTask(CAD_482);

    expect(task.labels).toEqual(['Sécurité', 'auth']);
    expect(task.checklist.map((item) => item.text)).toEqual([
      'Relire les messages',
      'Tester le lien expiré',
    ]);
    expect(Object.keys(task)).not.toContain('id');
  });

  it('gives a completed task the instant of its completion', () => {
    const task = toTask({
      ...CAD_482,
      status: 'done',
      completedAt: new Date('2026-11-18T12:00:00.000Z'),
    });

    expect(task.completedAt).toBe('2026-11-18T12:00:00.000Z');
  });
});

describe('toTaskSummary', () => {
  const summary: TaskSummaryView = {
    id: CAD_482.id,
    key: CAD_482.key,
    name: CAD_482.name,
    status: CAD_482.status,
    cancelReason: null,
    priority: CAD_482.priority,
    assigneeIds: CAD_482.assigneeIds,
    dueDate: CAD_482.dueDate,
    startDate: CAD_482.startDate,
    estimateMinutes: CAD_482.estimateMinutes,
    labels: CAD_482.labels,
    parentKey: 'CAD-481',
    listId: CAD_482.listId,
    spaceId: CAD_482.spaceId,
    subtaskCounts: CAD_482.subtaskCounts,
    checklistCounts: CAD_482.checklistCounts,
    completedAt: null,
    createdAt: CAD_482.createdAt,
    version: 2,
  };

  it('answers a summary the response validator of the contract accepts', () => {
    expect(() =>
      ListSubtasksInternalResponse.parse({
        items: [toTaskSummary(summary)],
        nextCursor: null,
        total: 1,
      }),
    ).not.toThrow();
  });

  it('leaves out the description, the checklist, the author and the id', () => {
    const keys: string[] = Object.keys(toTaskSummary(summary));

    expect(keys).not.toEqual(
      expect.arrayContaining(['description', 'checklist', 'createdBy', 'id']),
    );
    expect(keys).not.toContain('description');
    expect(keys).not.toContain('checklist');
    expect(keys).not.toContain('createdBy');
    expect(keys).not.toContain('id');
  });
});

describe('toTaskRef', () => {
  it('keeps the key, the name and the status of the task as they are now', () => {
    expect(toTaskRef({ key: 'CAD-482', name: CAD_482.name, status: 'review' })).toEqual({
      key: 'CAD-482',
      name: CAD_482.name,
      status: 'review',
    });
  });
});
