import { ListMyTasksInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import type { TaskSummaryView } from '../../../../application/projections/task/task-summary.projection.js';
import { toMyTaskPage } from './my-task-page.mapper.js';

/** CAD-483, a subtask of CAD-482 assigned to Camille. */
const SUBTASK: TaskSummaryView = {
  id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b05',
  key: 'CAD-483',
  name: 'Écrire le lien magique',
  status: 'todo',
  cancelReason: null,
  priority: 'moyenne',
  assigneeIds: ['019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31'],
  dueDate: null,
  startDate: null,
  estimateMinutes: null,
  labels: [],
  parentKey: 'CAD-482',
  listId: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02',
  spaceId: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b03',
  subtaskCounts: { total: 0, closed: 0 },
  checklistCounts: { total: 0, done: 0 },
  completedAt: null,
  createdAt: new Date('2026-11-16T09:30:00.000Z'),
  version: 1,
};

describe('the page of the tasks of an account', () => {
  it('maps a page to a body the contract validates, with the count of each tab', () => {
    const body = toMyTaskPage(
      { items: [SUBTASK], next: null, counts: { open: 14, closed: 31 } },
      null,
    );

    expect(ListMyTasksInternalResponse.parse(body)).toEqual(body);
    expect(body.counts).toEqual({ open: 14, closed: 31 });
    expect(body.items[0]?.parentKey).toBe('CAD-482');
    expect(JSON.stringify(body)).not.toContain(SUBTASK.id);
  });

  it('gives a page that continues its cursor', () => {
    const body = toMyTaskPage(
      { items: [], next: null, counts: { open: 0, closed: 0 } },
      'cursor-of-the-next-page',
    );

    expect(body.nextCursor).toBe('cursor-of-the-next-page');
  });
});
