import { ListTasksInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import type { TaskSummaryPage } from '../../../../application/projections/query/task-summary-page.projection.js';
import type { TaskSummaryView } from '../../../../application/projections/task/task-summary.projection.js';
import { toTaskSummaryPage } from './task-summary-page.mapper.js';

const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';
const SPACE = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b03';
const LIST = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02';

/** CAD-482 in "Sprint 14", with the internal id the contract never shows. */
const TASK: TaskSummaryView = {
  id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
  key: 'CAD-482',
  name: 'Ajouter la connexion par lien magique',
  status: 'progress',
  cancelReason: null,
  priority: 'haute',
  assigneeIds: [CAMILLE],
  dueDate: '2026-11-08',
  startDate: null,
  estimateMinutes: 120,
  labels: ['Auth'],
  parentKey: null,
  listId: LIST,
  spaceId: SPACE,
  subtaskCounts: { total: 3, closed: 1 },
  checklistCounts: { total: 2, done: 2 },
  completedAt: null,
  createdAt: new Date('2026-11-16T09:00:00.000Z'),
  version: 3,
};

describe('the page of the tasks of a list', () => {
  it('maps a page to a body the contract validates, without the id of the tasks', () => {
    const page: TaskSummaryPage = { items: [TASK], next: null, total: 98 };

    const body = toTaskSummaryPage(page, 'cursor-of-the-next-page');

    expect(ListTasksInternalResponse.parse(body)).toEqual(body);
    expect(body.nextCursor).toBe('cursor-of-the-next-page');
    expect(body.total).toBe(98);
    expect(JSON.stringify(body)).not.toContain(TASK.id);
  });

  it('gives the last page a null cursor and an empty page its total', () => {
    expect(toTaskSummaryPage({ items: [], next: null, total: 0 }, null)).toEqual({
      items: [],
      nextCursor: null,
      total: 0,
    });
  });
});
