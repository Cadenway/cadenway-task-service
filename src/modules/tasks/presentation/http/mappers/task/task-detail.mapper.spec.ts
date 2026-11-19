import { GetTaskDetailInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import type { TaskDetailView } from '../../../../application/projections/task/task-detail.projection.js';
import { toTaskDetail } from './task-detail.mapper.js';

/** Camille Martin (CM), a member of Atelier Nord. */
const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';
const SPACE = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b03';
const LIST = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02';

/** CAD-482 in "Sprint 14", with its parent and one subtask. */
const DETAIL: TaskDetailView = {
  task: {
    id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
    key: 'CAD-482',
    name: 'Ajouter la connexion par lien magique',
    status: 'progress',
    cancelReason: null,
    description: null,
    cancelNote: null,
    priority: 'haute',
    assigneeIds: [CAMILLE],
    dueDate: null,
    startDate: null,
    estimateMinutes: null,
    labels: [],
    parentKey: 'CAD-480',
    listId: LIST,
    spaceId: SPACE,
    subtaskCounts: { total: 1, closed: 0 },
    checklistCounts: { total: 0, done: 0 },
    completedAt: null,
    createdAt: new Date('2026-11-16T09:00:00.000Z'),
    version: 3,
    checklist: [],
    createdBy: { type: 'user', id: CAMILLE },
    updatedAt: new Date('2026-11-18T10:15:30.123Z'),
  },
  space: {
    id: SPACE,
    name: 'Cadenway',
    prefix: 'CAD',
    description: null,
    icon: 'rocket',
    color: 'bleu',
    visibility: 'organization',
    ownerUserId: CAMILLE,
    statuses: {
      triage: { name: null, hidden: false },
      backlog: { name: null, hidden: true },
      todo: { name: null, hidden: false },
      progress: { name: 'En cours', hidden: false },
      review: { name: null, hidden: false },
      testing: { name: null, hidden: false },
      waiting: { name: null, hidden: false },
      blocked: { name: null, hidden: false },
      done: { name: null, hidden: false },
      cancelled: { name: null, hidden: false },
    },
    nextKey: 'CAD-483',
    createdAt: new Date('2026-11-01T08:00:00.000Z'),
    version: 2,
    callerRole: 'edit',
    callerCanManage: true,
  },
  list: {
    id: LIST,
    spaceId: SPACE,
    name: 'Sprint 14',
    icon: null,
    color: 'gris',
    sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: null },
    createdAt: new Date('2026-11-02T08:00:00.000Z'),
    version: 1,
    organizationAccess: true,
    callerRole: 'edit',
  },
  parent: { key: 'CAD-480', name: 'Authentification', status: 'progress' },
  subtasks: [
    {
      id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b09',
      key: 'CAD-484',
      name: 'Relire les messages',
      status: 'todo',
      cancelReason: null,
      priority: 'moyenne',
      assigneeIds: [CAMILLE],
      dueDate: null,
      startDate: null,
      estimateMinutes: null,
      labels: [],
      parentKey: 'CAD-482',
      listId: LIST,
      spaceId: SPACE,
      subtaskCounts: { total: 0, closed: 0 },
      checklistCounts: { total: 0, done: 0 },
      completedAt: null,
      createdAt: new Date('2026-11-17T08:00:00.000Z'),
      version: 1,
    },
  ],
};

describe('toTaskDetail', () => {
  it('answers a detail the response validator of the contract accepts', () => {
    expect(() => GetTaskDetailInternalResponse.parse(toTaskDetail(DETAIL))).not.toThrow();
  });

  it('gives the space its owner, the category of each status and its creation instant', () => {
    const { space } = toTaskDetail(DETAIL);

    expect(space.owner).toEqual({ userId: CAMILLE });
    expect(space.statuses.backlog).toEqual({ category: 'open', name: null, hidden: true });
    expect(space.statuses.progress).toEqual({
      category: 'active',
      name: 'En cours',
      hidden: false,
    });
    expect(space.statuses.done.category).toBe('closed');
    expect(space.createdAt).toBe('2026-11-01T08:00:00.000Z');
    expect(space.nextKey).toBe('CAD-483');
  });

  it('gives the list its sprint and the task its parent reference and subtasks', () => {
    const detail = toTaskDetail(DETAIL);

    expect(detail.list.sprint).toEqual({
      startDate: '2026-11-03',
      endDate: '2026-11-17',
      goal: null,
    });
    expect(detail.parent).toEqual({ key: 'CAD-480', name: 'Authentification', status: 'progress' });
    expect(detail.subtasks.map((subtask) => subtask.key)).toEqual(['CAD-484']);
  });

  it('gives the space and the list the access of the caller, as the spaces module computed it', () => {
    const detail = toTaskDetail({
      ...DETAIL,
      space: { ...DETAIL.space, callerRole: null, callerCanManage: false },
      list: { ...DETAIL.list, organizationAccess: false, callerRole: 'view' },
    });

    expect(GetTaskDetailInternalResponse.parse(detail)).toEqual(detail);
    expect(detail.space).toMatchObject({ callerRole: null, callerCanManage: false });
    expect(detail.list).toMatchObject({ organizationAccess: false, callerRole: 'view' });
    expect(toTaskDetail(DETAIL).space).toMatchObject({ callerRole: 'edit', callerCanManage: true });
  });

  it('gives a top-level task no parent and a list that is not a sprint no sprint', () => {
    const detail = toTaskDetail({
      ...DETAIL,
      parent: null,
      list: { ...DETAIL.list, sprint: null },
    });

    expect(detail.parent).toBeNull();
    expect(detail.list.sprint).toBeNull();
  });
});
