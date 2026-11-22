import { describe, expect, it, vi } from 'vitest';

import { buildTimesheet } from '../../../../../domain/policies/reporting/timesheet.policy.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { ReportingReader } from '../../../../ports/outbound/persistence/reporting/reporting-reader.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { ReportingUnitOfWork } from '../../../../ports/outbound/transactions/reporting/reporting-unit-of-work.port.js';
import { GetListTimesheet } from './get-list-timesheet.use-case.js';

describe('GetListTimesheet', () => {
  it('keeps full-week totals when entries are on a later page', async () => {
    const task = { key: TaskKey.parse('CAD-2'), name: 'Work', status: 'todo' as const };
    const weekly = buildTimesheet('2026-11-02', [
      { task, authorUserId: 'a', workDate: '2026-11-02', minutes: 30 },
      { task, authorUserId: 'b', workDate: '2026-11-03', minutes: 45 },
    ]);
    const read = vi.fn().mockResolvedValue({
      ...weekly,
      items: weekly.items.slice(0, 1),
      next: { userId: 'a', taskKey: 'CAD-2' },
    });
    const reader = { timesheetPage: read } as unknown as ReportingReader;
    const work: ReportingUnitOfWork = { runReadOnly: async (fn) => fn(reader) };
    const members = { roleOf: vi.fn().mockResolvedValue('member') } as unknown as MemberDirectory;
    const spaces = { findVisibleList: vi.fn().mockResolvedValue({}) } as unknown as SpaceDirectory;
    const result = await new GetListTimesheet(work, members, spaces).execute({
      organizationId: 'org',
      actorUserId: 'actor',
      listId: 'list',
      weekStart: '2026-11-02',
      after: null,
      limit: 1,
    });
    expect(result.totalMinutes).toBe(75);
    expect(result.days.slice(0, 2)).toEqual([
      { date: '2026-11-02', totalMinutes: 30 },
      { date: '2026-11-03', totalMinutes: 45 },
    ]);
    expect(result.items).toHaveLength(1);
    expect(result.next).toEqual({ userId: 'a', taskKey: 'CAD-2' });
    expect(read).toHaveBeenCalledExactlyOnceWith('org', 'list', '2026-11-02', null, 1);
  });
});
