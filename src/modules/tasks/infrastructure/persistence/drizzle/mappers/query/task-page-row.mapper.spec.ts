import { describe, expect, it } from 'vitest';

import type { TaskSummaryView } from '../../../../../application/projections/task/task-summary.projection.js';
import { renderSql } from './query-sql.fixture.js';
import { taskPageColumns, toListedTask, toTaskPageRow } from './task-page-row.mapper.js';
import type { RawTaskPageRow } from './raw-task-page-row.mapper.js';

const RAW: RawTaskPageRow = {
  id: '0196f3b2-0000-7000-8000-000000000001',
  keyPrefix: 'CAD',
  keyNumber: 482,
  name: 'Écran SSO',
  status: 'done',
  cancelReason: null,
  priority: 'haute',
  dueDate: '2026-11-10',
  startDate: null,
  estimateMinutes: 90,
  completedAt: '2026-11-03T10:15:00.250Z',
  createdAt: '2026-11-02T09:00:00.123Z',
  listId: '0196f3b2-0000-7000-8000-0000000000a1',
  spaceId: '0196f3b2-0000-7000-8000-0000000000b1',
  parentId: null,
  version: 3,
  sortValue: '2026-11-10',
};

describe('taskPageColumns: the select list of a page', () => {
  it('selects the instants as UTC text and the dates as text, whatever the driver parsers', () => {
    const { sql } = renderSql(taskPageColumns());

    expect(sql).toContain(
      `to_char("tasks"."created_at" at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"`,
    );
    expect(sql).toContain('"tasks"."due_date"::text as "dueDate"');
    expect(sql).not.toContain('"description"');
    expect(sql).not.toContain('"cancel_note"');
  });
});

describe('toTaskPageRow: the instants of a raw row become dates', () => {
  it('reads the creation and the completion to the millisecond', () => {
    const row = toTaskPageRow(RAW);

    expect(row.createdAt).toEqual(new Date('2026-11-02T09:00:00.123Z'));
    expect(row.completedAt).toEqual(new Date('2026-11-03T10:15:00.250Z'));
    expect(row.sortValue).toBe('2026-11-10');
  });

  it('keeps a missing completion null', () => {
    expect(toTaskPageRow({ ...RAW, completedAt: null }).completedAt).toBeNull();
  });
});

describe('toListedTask: the position after a task', () => {
  it('pairs the summary with its sort value, creation instant and id', () => {
    const row = toTaskPageRow(RAW);
    const task = { id: RAW.id } as TaskSummaryView;

    expect(toListedTask(row, task)).toEqual({
      task,
      position: {
        sortValue: '2026-11-10',
        createdAt: new Date('2026-11-02T09:00:00.123Z'),
        id: RAW.id,
      },
    });
  });
});
