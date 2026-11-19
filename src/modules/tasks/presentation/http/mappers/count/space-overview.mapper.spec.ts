import { GetSpaceOverviewInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import type { ListSummaryView } from '../../../../application/projections/count/list-summary.projection.js';
import { toSpaceOverviewPosition } from './space-overview-cursor.mapper.js';
import { toSpaceOverview } from './space-overview.mapper.js';

const SPACE = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b03';

/** "Sprint 14": 98 top-level tasks. */
const SPRINT_14: ListSummaryView = {
  list: {
    id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02',
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

describe('the overview of a space', () => {
  it('maps the overview to a body the contract validates, without a cursor on the last page', () => {
    const body = toSpaceOverview({
      spaceId: SPACE,
      listCount: 4,
      taskCount: 108,
      items: [SPRINT_14],
      next: null,
    });

    expect(GetSpaceOverviewInternalResponse.parse(body)).toEqual(body);
    expect(body).toMatchObject({ listCount: 4, taskCount: 108, nextCursor: null });
  });

  it('gives the next page a cursor of this space that decodes to its position', () => {
    const next = { createdAt: SPRINT_14.list.createdAt, id: SPRINT_14.list.id };

    const body = toSpaceOverview({
      spaceId: SPACE,
      listCount: 4,
      taskCount: 108,
      items: [SPRINT_14],
      next,
    });

    expect(toSpaceOverviewPosition(body.nextCursor ?? undefined, SPACE)).toEqual(next);
  });
});
