import { describe, expect, it, vi } from 'vitest';

import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { ReportingReader } from '../../../../ports/outbound/persistence/reporting/reporting-reader.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { ReportingUnitOfWork } from '../../../../ports/outbound/transactions/reporting/reporting-unit-of-work.port.js';
import type { TaskSummaryView } from '../../../../projections/task/task-summary.projection.js';
import { GetTeamDashboard } from './get-team-dashboard.use-case.js';

describe('GetTeamDashboard', () => {
  it.each([
    ['2026-11-06T10:00:00Z', '2026-11-06T10:00:00Z'],
    ['2026-12-01T00:00:00Z', '2026-11-08T00:00:00Z'],
  ])(
    'limits completion reads to visible live lists and the historical day at %s',
    async (serverTime, readThrough) => {
      const readTasks = vi.fn().mockResolvedValue({ items: [], next: null });
      const readTransitions = vi.fn().mockResolvedValue({ items: [], next: null });
      const readSummaries = vi.fn();
      const visibleListIds = vi.fn().mockResolvedValue(['visible']);
      const reader = {
        dashboardTasks: readTasks,
        dashboardTransitions: readTransitions,
        dashboardSummaries: readSummaries,
      } as unknown as ReportingReader;
      const work: ReportingUnitOfWork = { runReadOnly: async (fn) => fn(reader) };
      const members = { roleOf: vi.fn().mockResolvedValue('member') } as unknown as MemberDirectory;
      const spaces = { visibleListIds } as unknown as SpaceDirectory;
      const now = new Date(serverTime);
      const result = await new GetTeamDashboard(work, members, spaces, () => now).execute({
        organizationId: 'org',
        actorUserId: 'actor',
        today: '2026-11-06',
        timeZone: 'Europe/Paris',
        weeks: 8,
      });
      expect(result.completions).toHaveLength(8);
      expect(result.overdueTasks).toEqual([]);
      expect(result.observedAt).toEqual(now);
      expect(readSummaries).not.toHaveBeenCalled();
      expect(visibleListIds).toHaveBeenCalledWith(
        'org',
        { userId: 'actor', role: 'member' },
        { liveOnly: true },
      );
      expect(readTasks).toHaveBeenCalledWith('org', ['visible'], null, 500);
      expect(readTransitions).toHaveBeenCalledWith(
        'org',
        ['visible'],
        new Date('2026-09-13T00:00:00.000Z'),
        new Date(readThrough),
        null,
        500,
      );
    },
  );

  it('loads only the selected overdue summaries and restores the policy order', async () => {
    const tasks = Array.from({ length: 12 }, (_, index) => ({
      id: `id-${String(index + 1)}`,
      key: TaskKey.parse(`CAD-${String(index + 1)}`),
      status: 'todo' as const,
      dueDate: '2026-11-01',
      assigneeIds: ['actor'],
    }));
    const summaries = tasks.map((task) => ({
      id: task.id,
      key: task.key.format(),
    })) as TaskSummaryView[];
    const readSummaries = vi.fn().mockResolvedValue(summaries.slice(0, 10).reverse());
    const reader = {
      dashboardTasks: vi.fn().mockResolvedValue({ items: tasks, next: null }),
      dashboardTransitions: vi.fn().mockResolvedValue({ items: [], next: null }),
      dashboardSummaries: readSummaries,
    } as unknown as ReportingReader;
    const work: ReportingUnitOfWork = { runReadOnly: async (fn) => fn(reader) };
    const members = { roleOf: vi.fn().mockResolvedValue('member') } as unknown as MemberDirectory;
    const spaces = {
      visibleListIds: vi.fn().mockResolvedValue(['visible']),
    } as unknown as SpaceDirectory;
    const result = await new GetTeamDashboard(work, members, spaces).execute({
      organizationId: 'org',
      actorUserId: 'actor',
      today: '2026-11-06',
      timeZone: 'Europe/Paris',
      weeks: 8,
    });

    expect(result.openCount).toBe(12);
    expect(result.lateCount).toBe(12);
    expect(readSummaries).toHaveBeenCalledWith(
      'org',
      ['visible'],
      tasks.slice(0, 10).map((task) => task.id),
    );
    expect(result.overdueTasks).toEqual(summaries.slice(0, 10));
  });

  it.each(['missing', 'duplicate', 'unexpected'])(
    'refuses %s selected summaries',
    async (caseName) => {
      const tasks = [1, 2].map((number) => ({
        id: `id-${String(number)}`,
        key: TaskKey.parse(`CAD-${String(number)}`),
        status: 'todo' as const,
        dueDate: '2026-11-01',
        assigneeIds: [],
      }));
      const ids =
        caseName === 'missing'
          ? ['id-1']
          : caseName === 'duplicate'
            ? ['id-1', 'id-1']
            : ['id-1', 'other'];
      const reader = {
        dashboardTasks: vi.fn().mockResolvedValue({ items: tasks, next: null }),
        dashboardTransitions: vi.fn().mockResolvedValue({ items: [], next: null }),
        dashboardSummaries: vi.fn().mockResolvedValue(ids.map((id) => ({ id }))),
      } as unknown as ReportingReader;
      const work: ReportingUnitOfWork = { runReadOnly: async (fn) => fn(reader) };
      const members = { roleOf: vi.fn().mockResolvedValue('member') } as unknown as MemberDirectory;
      const spaces = {
        visibleListIds: vi.fn().mockResolvedValue(['visible']),
      } as unknown as SpaceDirectory;

      await expect(
        new GetTeamDashboard(work, members, spaces).execute({
          organizationId: 'org',
          actorUserId: 'actor',
          today: '2026-11-06',
          timeZone: 'Europe/Paris',
          weeks: 8,
        }),
      ).rejects.toThrow(/dashboard overdue task summary|dashboard overdue task summaries/u);
    },
  );
});
