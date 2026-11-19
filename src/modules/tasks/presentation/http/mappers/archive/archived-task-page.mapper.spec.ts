import { ListArchivedTasksInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import type { ArchivedTaskPage } from '../../../../application/projections/archive/archived-task-page.projection.js';
import { toArchivesPosition } from './archive-cursor.mapper.js';
import { toArchivedTaskPage } from './archived-task-page.mapper.js';

/** Hugo Dubois (HD), who archived CAD-430. */
const HUGO = '019a5f3c-a0b1-7c2d-9e3f-5a6b7c8d9e32';

/** One page holding CAD-430, archived alone from Sprint 14, with a next page. */
const PAGE: ArchivedTaskPage = {
  items: [
    {
      task: {
        id: '019a7200-0000-7000-8000-000000000430',
        key: 'CAD-430',
        name: 'Ancienne page des tarifs',
        status: 'done',
        cancelReason: null,
        priority: 'basse',
        assigneeIds: [HUGO],
        dueDate: null,
        startDate: null,
        estimateMinutes: 120,
        labels: ['Front'],
        parentKey: null,
        listId: '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f12',
        spaceId: '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01',
        subtaskCounts: { total: 0, closed: 0 },
        checklistCounts: { total: 0, done: 0 },
        completedAt: new Date('2026-11-04T17:10:00.000Z'),
        createdAt: new Date('2026-10-21T09:00:00.000Z'),
        version: 7,
      },
      list: {
        id: '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f12',
        spaceId: '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01',
        name: 'Sprint 14',
        state: 'archived',
      },
      subtaskCount: 0,
      archivedAt: new Date('2026-11-05T11:30:00.000Z'),
      archivedBy: { type: 'user', id: HUGO },
    },
  ],
  next: {
    archivedAt: new Date('2026-11-05T11:30:00.000Z'),
    id: '019a7200-0000-7000-8000-000000000430',
  },
  total: 3,
};

describe('toArchivedTaskPage', () => {
  it('answers a page the response validator of the contract accepts', () => {
    expect(() => ListArchivedTasksInternalResponse.parse(toArchivedTaskPage(PAGE))).not.toThrow();
  });

  it('maps the root, its list as it is now, its subtasks and its archive', () => {
    const [item] = toArchivedTaskPage(PAGE).items;

    expect(item).toMatchObject({
      task: { key: 'CAD-430', assignees: [{ userId: HUGO }] },
      list: { name: 'Sprint 14', state: 'archived' },
      subtaskCount: 0,
      archivedAt: '2026-11-05T11:30:00.000Z',
      archivedBy: { type: 'user', id: HUGO },
    });
    expect(Object.keys(item?.task ?? {})).not.toContain('id');
  });

  it('gives the cursor of the next page of the tab and the total', () => {
    const body = toArchivedTaskPage(PAGE);

    expect(toArchivesPosition(body.nextCursor ?? undefined, 'archived-tasks')).toEqual(PAGE.next);
    expect(body.total).toBe(3);
    expect(toArchivedTaskPage({ ...PAGE, next: null }).nextCursor).toBeNull();
  });
});
