import { describe, expect, it, vi } from 'vitest';

import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { ReportingReader } from '../../../../ports/outbound/persistence/reporting/reporting-reader.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { ReportingUnitOfWork } from '../../../../ports/outbound/transactions/reporting/reporting-unit-of-work.port.js';
import type { GetListWorkloadInput } from './get-list-workload.input.js';
import { GetListWorkload } from './get-list-workload.use-case.js';

const input: GetListWorkloadInput = {
  organizationId: 'org',
  actorUserId: 'actor',
  listId: 'list',
  weekStart: '2026-11-02',
  filter: {
    statuses: null,
    priorities: null,
    assignees: null,
    labels: null,
    search: null,
    dueFrom: null,
    dueTo: null,
    level: 'all',
  },
  after: null,
  limit: 1,
};

describe('GetListWorkload', () => {
  it('calculates totals over all batches before returning a page of positive rows', async () => {
    const task = {
      key: TaskKey.parse('CAD-1'),
      name: 'Work',
      status: 'todo' as const,
      startDate: null,
      dueDate: '2026-11-02',
      estimateMinutes: 2,
      assigneeIds: ['c', 'b', 'a'],
    };
    const read = vi
      .fn()
      .mockResolvedValueOnce({ items: [task], next: 'one' })
      .mockResolvedValueOnce({ items: [], next: null });
    const reader = { workloadTasks: read } as unknown as ReportingReader;
    const work: ReportingUnitOfWork = { runReadOnly: async (fn) => fn(reader) };
    const members = { roleOf: vi.fn().mockResolvedValue('member') } as unknown as MemberDirectory;
    const spaces = { findVisibleList: vi.fn().mockResolvedValue({}) } as unknown as SpaceDirectory;
    const result = await new GetListWorkload(work, members, spaces).execute(input);
    expect(result.totalMinutes).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ assigneeId: 'a', totalMinutes: 1 });
    expect(result.next).toEqual({ userId: 'a', taskKey: 'CAD-1' });
    expect(read).toHaveBeenCalledTimes(2);
    const second = await new GetListWorkload(
      {
        runReadOnly: async (fn) =>
          fn({
            workloadTasks: vi.fn().mockResolvedValue({ items: [task], next: null }),
          } as unknown as ReportingReader),
      },
      members,
      spaces,
    ).execute({ ...input, after: result.next });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]).toMatchObject({ assigneeId: 'b', totalMinutes: 1 });
    expect(second.next).toBeNull();
  });
});
