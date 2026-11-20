import { describe, expect, it, vi } from 'vitest';

import type { SprintReportRead } from '../../../../../application/models/reporting/sprint-report-read.model.js';
import type { SprintReportSnapshot } from '../../../../../application/models/reporting/sprint-report-snapshot.model.js';
import { projectSprintReport } from '../../../../../domain/policies/reporting/sprint-report.policy.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { DrizzleSprintHistoryRepository } from '../sprint-history/drizzle-sprint-history.repository.js';
import { DrizzleSprintReportRepository } from './drizzle-sprint-report.repository.js';

const sprint = {
  listId: 'list',
  spaceId: 'space',
  name: 'Sprint',
  startDate: '2026-11-03',
  endDate: '2026-11-08',
};
const request: SprintReportRead = {
  sprint,
  visibleListIds: ['list'],
  viewer: { userId: 'user', role: 'member' },
  today: '2026-11-06',
  timeZone: 'Europe/Paris',
  serverObservedAt: new Date('2026-11-06T12:00:00Z'),
  snapshot: null,
  after: null,
  limit: 2,
};

describe('DrizzleSprintReportRepository', () => {
  it('reconstructs points with the frozen snapshot, bounded pages and the local calendar', async () => {
    const task = {
      taskId: 'task',
      listId: 'list',
      spaceId: 'space',
      parentId: null,
      name: 'Example',
      status: 'progress' as const,
      estimateMinutes: 90,
      milestone: false,
      archivedAt: null,
      trashEntryId: null,
      key: TaskKey.parse('CAD-1'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      unchangedSinceCoverage: true,
    };
    const source = {
      captureObservation: vi.fn().mockResolvedValue('100:110:'),
      currentFields: vi.fn().mockResolvedValue([]),
      fieldFacts: vi.fn().mockResolvedValue([]),
      candidates: vi.fn().mockResolvedValue(['task']),
      currentTasks: vi.fn().mockResolvedValue([task]),
      taskFacts: vi.fn().mockResolvedValue([]),
      valueFacts: vi.fn().mockResolvedValue([]),
      currentValues: vi.fn().mockResolvedValue([]),
    };
    const metadata = vi.fn().mockResolvedValue({
      coverageStartedAt: new Date('2026-11-01T00:00:00Z'),
      current: {
        ...sprint,
        intervals: [{ startsAt: new Date('2026-01-01T00:00:00Z'), endsBefore: null }],
      },
      prior: [],
    });
    const repository = new DrizzleSprintReportRepository(
      source as unknown as DrizzleSprintHistoryRepository,
      metadata,
    );
    const result = await repository.read('org', request);
    expect(result.snapshot).toBe('100:110:');
    expect(result.input.openingPoints).toBe(2);
    expect(result.input.days.map(({ date, remainingPoints }) => [date, remainingPoints])).toEqual([
      ['2026-11-03', 2],
      ['2026-11-04', 2],
    ]);
    expect(result.next).toBe('2026-11-04');
    expect(result.input.trendDays.map(({ date }) => date)).toEqual(['2026-11-04', '2026-11-05']);
    expect(source.taskFacts).toHaveBeenCalledWith(
      'org',
      ['task'],
      ['list'],
      request.serverObservedAt,
      '100:110:',
      null,
      500,
    );
    await repository.read('org', { ...request, snapshot: '100:110:' as SprintReportSnapshot });
    expect(source.captureObservation).toHaveBeenCalledTimes(1);
  });

  it('returns unavailable points for a sprint entirely skipped by its time zone', async () => {
    const skipped = { ...sprint, startDate: '2011-12-30', endDate: '2011-12-30' };
    const coverage = new Date('2011-12-28T00:00:00Z');
    const source = {
      captureObservation: vi.fn().mockResolvedValue('100:110:'),
      currentFields: vi.fn().mockResolvedValue([]),
      fieldFacts: vi.fn().mockResolvedValue([]),
      candidates: vi.fn().mockResolvedValue([]),
    };
    const repository = new DrizzleSprintReportRepository(
      source as unknown as DrizzleSprintHistoryRepository,
      () =>
        Promise.resolve({
          coverageStartedAt: coverage,
          current: { ...skipped, intervals: [{ startsAt: coverage, endsBefore: null }] },
          prior: [],
        }),
    );
    const result = await repository.read('org', {
      ...request,
      sprint: skipped,
      today: '2011-12-30',
      timeZone: 'Pacific/Apia',
    });
    expect(result.next).toBeNull();
    expect(result.input.trendDays).toEqual([]);
    expect(projectSprintReport(result.input)).toMatchObject({
      observedAt: new Date('2011-12-30T09:59:59.999Z'),
      openingPoints: null,
      delivered: null,
      remaining: null,
      projectedRemainingPoints: null,
      items: [
        {
          date: '2011-12-30',
          actualRemainingPoints: null,
          idealRemainingPoints: null,
          projectedRemainingPoints: null,
        },
      ],
    });
  });
});
