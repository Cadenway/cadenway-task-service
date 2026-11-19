import { GetListCountsInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import type { ListSummaryView } from '../../../../application/projections/count/list-summary.projection.js';
import { toListSummary } from './list-summary.mapper.js';

/** "Sprint 14": 98 top-level tasks, 72 open, 24 done, 2 cancelled and 3 late. */
const SPRINT_14: ListSummaryView = {
  list: {
    id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02',
    spaceId: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b03',
    name: 'Sprint 14',
    icon: null,
    color: 'bleu',
    sprint: { startDate: '2026-11-02', endDate: '2026-11-15', goal: null },
    createdAt: new Date('2026-11-01T08:00:00.000Z'),
    version: 2,
    organizationAccess: true,
    callerRole: 'edit',
  },
  counts: { total: 98, open: 72, done: 24, cancelled: 2, late: 3 },
};

describe('the list and its counters', () => {
  it('maps a list to a body the contract validates', () => {
    const body = toListSummary(SPRINT_14);

    expect(GetListCountsInternalResponse.parse(body)).toEqual(body);
    expect(body.counts).toEqual({ total: 98, open: 72, done: 24, cancelled: 2, late: 3 });
    expect(body.list.sprint).toEqual({
      startDate: '2026-11-02',
      endDate: '2026-11-15',
      goal: null,
    });
    expect(body.list.createdAt).toBe('2026-11-01T08:00:00.000Z');
  });

  it('carries the switch of the organization and the role of the caller on the list', () => {
    const body = toListSummary({
      ...SPRINT_14,
      list: { ...SPRINT_14.list, organizationAccess: false, callerRole: 'comment' },
    });

    expect(GetListCountsInternalResponse.parse(body)).toEqual(body);
    expect(body.list).toMatchObject({ organizationAccess: false, callerRole: 'comment' });
  });

  it('keeps a list that is not a sprint as such, with zero counters', () => {
    const body = toListSummary({
      list: { ...SPRINT_14.list, sprint: null },
      counts: { total: 0, open: 0, done: 0, cancelled: 0, late: 0 },
    });

    expect(body.list.sprint).toBeNull();
    expect(body.counts.total).toBe(0);
  });
});
