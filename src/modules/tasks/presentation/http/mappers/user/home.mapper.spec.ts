import { GetHomeInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import type { ListSummaryView } from '../../../../application/projections/count/list-summary.projection.js';
import type { TaskSummaryView } from '../../../../application/projections/task/task-summary.projection.js';
import { toHome } from './home.mapper.js';

const SPACE = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b03';
const LIST = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02';

/** CAD-482, due on the day of the home. */
const PRIORITY: TaskSummaryView = {
  id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
  key: 'CAD-482',
  name: 'Ajouter la connexion par lien magique',
  status: 'progress',
  cancelReason: null,
  priority: 'urgente',
  assigneeIds: ['019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31'],
  dueDate: '2026-11-08',
  startDate: null,
  estimateMinutes: null,
  labels: [],
  parentKey: null,
  listId: LIST,
  spaceId: SPACE,
  subtaskCounts: { total: 0, closed: 0 },
  checklistCounts: { total: 0, done: 0 },
  completedAt: null,
  createdAt: new Date('2026-11-16T09:00:00.000Z'),
  version: 3,
};

/** "Sprint 14": 98 top-level tasks. */
const SPRINT_14: ListSummaryView = {
  list: {
    id: LIST,
    spaceId: SPACE,
    name: 'Sprint 14',
    icon: null,
    color: 'bleu',
    sprint: { startDate: '2026-11-02', endDate: '2026-11-15', goal: null },
    createdAt: new Date('2026-11-01T08:00:00.000Z'),
    version: 2,
    organizationAccess: true,
    archivedAt: null,
    archivedBy: null,
    callerRole: 'edit',
  },
  counts: { total: 98, open: 72, done: 24, cancelled: 2, late: 3 },
};

describe('the home of an account', () => {
  it('maps the home to a body the contract validates', () => {
    const body = toHome({
      stats: { assigned: 14, late: 2, dueToday: 1, done: 31 },
      priorities: [PRIORITY],
      sprints: [SPRINT_14],
      lists: [SPRINT_14],
    });

    expect(GetHomeInternalResponse.parse(body)).toEqual(body);
    expect(body.stats).toEqual({ assigned: 14, late: 2, dueToday: 1, done: 31 });
    expect(body.sprints[0]?.counts.total).toBe(98);
    expect(JSON.stringify(body)).not.toContain(PRIORITY.id);
  });

  it('answers zeros and empty arrays for an account that sees nothing', () => {
    const body = toHome({
      stats: { assigned: 0, late: 0, dueToday: 0, done: 0 },
      priorities: [],
      sprints: [],
      lists: [],
    });

    expect(GetHomeInternalResponse.parse(body)).toEqual(body);
    expect(body).toEqual({
      stats: { assigned: 0, late: 0, dueToday: 0, done: 0 },
      priorities: [],
      sprints: [],
      lists: [],
    });
  });
});
