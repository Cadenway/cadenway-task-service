import { describe, expect, it, vi } from 'vitest';

import type { SprintReportInput } from '../../../../../domain/value-objects/reporting/sprint-report-input.value-object.js';
import type { SprintReportSnapshot } from '../../../../models/reporting/sprint-report-snapshot.model.js';
import type { SprintReportReader } from '../../../../ports/outbound/persistence/reporting/sprint-report-reader.port.js';
import type { SprintReportUnitOfWork } from '../../../../ports/outbound/transactions/reporting/sprint-report-unit-of-work.port.js';
import {
  ATELIER_NORD,
  BUGS,
  CAMILLE,
  InMemorySpaceDirectory,
  SPRINT_14,
  STRANGER,
  atelierNordMembers,
} from '../../../tasks.fixture.js';
import type { GetSprintReportInput } from './get-sprint-report.input.js';
import { GetSprintReport } from './get-sprint-report.use-case.js';

const observedAt = new Date('2026-11-08T12:00:00Z');
const snapshot = '20:24:21,23' as SprintReportSnapshot;
const schedule = {
  name: 'Sprint 14',
  startDate: '2026-11-02',
  endDate: '2026-11-15',
};

function request(overrides: Partial<GetSprintReportInput> = {}): GetSprintReportInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    listId: SPRINT_14,
    today: '2026-11-08',
    timeZone: 'Europe/Paris',
    serverObservedAt: observedAt,
    after: null,
    limit: 1,
    ...overrides,
  };
}

function history(coverageStartedAt: Date | null): SprintReportInput {
  return {
    sprint: {
      listId: SPRINT_14,
      spaceId: 'space',
      ...schedule,
    },
    timing: {
      opensAt: new Date('2026-11-01T23:00:00Z'),
      closesAt: new Date('2026-11-15T22:59:59.999Z'),
      requestedDayEndsAt: new Date('2026-11-08T22:59:59.999Z'),
      serverObservedAt: observedAt,
    },
    observedDay: {
      date: '2026-11-08',
      startsAt: new Date('2026-11-07T23:00:00Z'),
      endsAt: new Date('2026-11-08T22:59:59.999Z'),
    },
    coverageStartedAt,
    openingPoints: coverageStartedAt === null ? null : 0,
    observedTasks: coverageStartedAt === null ? null : [],
    days: [
      {
        date: '2026-11-02',
        endsAt: new Date('2026-11-02T22:59:59.999Z'),
        remainingPoints: coverageStartedAt === null ? null : 0,
      },
    ],
    trendDays: [],
    priorSprints: [],
  };
}

function setup(coverageStartedAt: Date | null = null) {
  const read = vi.fn<SprintReportReader['read']>().mockResolvedValue({
    input: history(coverageStartedAt),
    next: '2026-11-02',
    snapshot,
  });
  const reader: SprintReportReader = { read };
  const work: SprintReportUnitOfWork = { runReadOnly: (run) => run(reader) };
  const members = atelierNordMembers();
  const spaces = new InMemorySpaceDirectory();
  const useCase = new GetSprintReport(work, members, spaces);
  return { members, read, spaces, useCase };
}

describe('GetSprintReport', () => {
  it('rechecks the viewer and keeps the server observation and original schedule across pages', async () => {
    const { read, spaces, useCase } = setup();
    const first = await useCase.execute(request());
    expect(read.mock.calls[0]?.[1].snapshot).toBeNull();
    const position = { date: '2026-11-02', serverObservedAt: observedAt, snapshot, schedule };
    expect(first.next).toEqual(position);

    const findVisibleList = spaces.findVisibleList.bind(spaces);
    const find = vi.spyOn(spaces, 'findVisibleList').mockImplementation(async (...parameters) => {
      const placement = await findVisibleList(...parameters);
      const sprint = placement?.list.sprint;
      if (placement === null || sprint === undefined || sprint === null) return placement;
      return {
        ...placement,
        list: {
          ...placement.list,
          name: 'Sprint shortened',
          sprint: { ...sprint, endDate: '2026-11-07' },
        },
      };
    });

    const result = await useCase.execute(
      request({
        serverObservedAt: new Date('2026-11-09T12:00:00Z'),
        after: first.next,
      }),
    );

    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenLastCalledWith(
      ATELIER_NORD,
      expect.objectContaining({
        today: '2026-11-08',
        timeZone: 'Europe/Paris',
        serverObservedAt: observedAt,
        after: '2026-11-02',
        snapshot,
        viewer: { userId: CAMILLE, role: 'owner' },
        limit: 1,
      }),
    );
    expect(read.mock.calls[1]?.[1].visibleListIds).toContain(SPRINT_14);
    expect(read.mock.calls[1]?.[1].sprint).toMatchObject(schedule);
    expect(result.next).toEqual(position);

    find.mockResolvedValueOnce(null);
    await expect(useCase.execute(request({ after: first.next }))).rejects.toMatchObject({
      refusal: { reason: 'list-not-found' },
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('preserves unknown coverage separately from a covered zero', async () => {
    const unknown = await setup().useCase.execute(request());
    const zero = await setup(new Date('2026-11-01T23:00:00Z')).useCase.execute(request());
    expect(unknown.openingPoints).toBeNull();
    expect(unknown.remaining).toBeNull();
    expect(unknown.items[0]?.actualRemainingPoints).toBeNull();
    expect(zero.openingPoints).toBe(0);
    expect(zero.remaining?.points).toBe(0);
    expect(zero.items[0]?.actualRemainingPoints).toBe(0);
  });

  it('rechecks membership before allowing a saved snapshot to be used', async () => {
    const { members, read, useCase } = setup();
    const first = await useCase.execute(request());
    vi.spyOn(members, 'roleOf').mockResolvedValue(null);
    await expect(useCase.execute(request({ after: first.next }))).rejects.toMatchObject({
      refusal: { reason: 'organization-not-found' },
    });
    expect(read).toHaveBeenCalledOnce();
  });

  it('does not read history for an ordinary list or a nonmember', async () => {
    const { read, useCase } = setup();
    await expect(useCase.execute(request({ listId: BUGS }))).rejects.toMatchObject({
      refusal: { reason: 'list-not-found' },
    });
    await expect(useCase.execute(request({ actorUserId: STRANGER }))).rejects.toMatchObject({
      refusal: { reason: 'organization-not-found' },
    });
    expect(read).not.toHaveBeenCalled();
  });
});
