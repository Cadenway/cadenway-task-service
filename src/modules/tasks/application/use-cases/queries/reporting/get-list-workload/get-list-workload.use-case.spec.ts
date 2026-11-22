import { describe, expect, it, vi } from 'vitest';

import { buildWorkload } from '../../../../../domain/policies/reporting/workload.policy.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { ReportingReader } from '../../../../ports/outbound/persistence/reporting/reporting-reader.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { ReportingUnitOfWork } from '../../../../ports/outbound/transactions/reporting/reporting-unit-of-work.port.js';
import { ReportingPage } from '../../../../services/reporting/reporting-page.service.js';
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
  it('checks visibility before reading any workload batch', async () => {
    const read = vi.fn();
    const reader = { workloadTasks: read } as unknown as ReportingReader;
    const work: ReportingUnitOfWork = { runReadOnly: async (fn) => fn(reader) };
    const members = { roleOf: vi.fn().mockResolvedValue('member') } as unknown as MemberDirectory;
    const spaces = {
      findVisibleList: vi.fn().mockResolvedValue(null),
    } as unknown as SpaceDirectory;

    await expect(new GetListWorkload(work, members, spaces).execute(input)).rejects.toMatchObject({
      refusal: { reason: 'list-not-found' },
    });
    expect(read).not.toHaveBeenCalled();
  });

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

  it('matches a complete report across batches, including cursors and all daily totals', async () => {
    const tasks = Array.from({ length: 1_201 }, (_, index) => ({
      key: TaskKey.parse(`CAD-${String(index + 1)}`),
      name: `Task ${String(index + 1)}`,
      status: index % 19 === 0 ? ('cancelled' as const) : ('todo' as const),
      startDate: '2026-11-02',
      dueDate: index % 2 === 0 ? '2026-11-06' : '2026-11-13',
      estimateMinutes: index % 7 === 0 ? 1 : index + 1,
      assigneeIds: index % 5 === 0 ? [] : ['z', 'a', 'm'],
    }));
    const read = vi.fn(
      (
        _organization: string,
        _list: string,
        _filter: unknown,
        after: string | null,
        limit: number,
      ) => {
        const offset = after === null ? 0 : Number(after);
        const items = tasks.slice(offset, offset + limit);
        const next = offset + items.length < tasks.length ? String(offset + items.length) : null;
        return Promise.resolve({ items, next });
      },
    );
    const reader = { workloadTasks: read } as unknown as ReportingReader;
    const work: ReportingUnitOfWork = { runReadOnly: async (fn) => fn(reader) };
    const roleOf = vi.fn().mockResolvedValue('member');
    const findVisibleList = vi.fn().mockResolvedValue({});
    const members = { roleOf } as unknown as MemberDirectory;
    const spaces = { findVisibleList } as unknown as SpaceDirectory;
    const useCase = new GetListWorkload(work, members, spaces);
    const complete = buildWorkload(input.weekStart, tasks);
    const pages = new ReportingPage();
    const position = (item: (typeof complete.items)[number]) => ({
      userId: item.assigneeId,
      taskKey: item.taskKey,
    });
    const visible = complete.items.filter((item) => item.totalMinutes > 0);
    const expectedFirst = pages.slice(visible, position, null, 7);
    const expectedSecond = pages.slice(visible, position, expectedFirst.next, 7);

    const first = await useCase.execute({ ...input, limit: 7 });
    const second = await useCase.execute({ ...input, after: first.next, limit: 7 });

    expect(first).toEqual({
      listId: input.listId,
      weekStart: input.weekStart,
      days: complete.days,
      totalMinutes: complete.totalMinutes,
      ...expectedFirst,
    });
    expect(second).toEqual({ ...first, ...expectedSecond });
    expect(first.days).toHaveLength(14);
    expect(read).toHaveBeenCalledTimes(6);
    expect(read.mock.calls.map((call) => call[3])).toEqual([
      null,
      '500',
      '1000',
      null,
      '500',
      '1000',
    ]);
    expect(
      read.mock.calls.every((call) => call[0] === 'org' && call[1] === 'list' && call[4] === 500),
    ).toBe(true);
    expect(roleOf).toHaveBeenCalledTimes(2);
    expect(findVisibleList).toHaveBeenCalledTimes(2);
  });
});
