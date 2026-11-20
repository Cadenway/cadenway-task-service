import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import type { SprintReportInput } from '../../value-objects/reporting/sprint-report-input.value-object.js';
import type { SprintReportTaskSnapshot } from '../../value-objects/reporting/sprint-report-task-snapshot.value-object.js';
import { TaskKey } from '../../value-objects/task/task-key.value-object.js';
import {
  projectSprintReport,
  sprintReportObservation,
  sprintTaskPoints,
} from './sprint-report.policy.js';

/** A currently readable task in the historical sprint scope. */
function task(overrides: Partial<SprintReportTaskSnapshot> = {}): SprintReportTaskSnapshot {
  return {
    key: TaskKey.parse('CAD-482'),
    name: 'Revoir le formulaire',
    status: 'progress',
    parentKey: null,
    milestone: false,
    archived: false,
    trashed: false,
    estimateMinutes: null,
    customPoints: null,
    ...overrides,
  };
}

/** Paris local date bounds after the autumn clock change in the Sprint 14 fixture. */
function localDay(date: string): SprintReportInput['observedDay'] {
  const endsAt = new Date(`${date}T22:59:59.999Z`);
  const startsAt = new Date(endsAt.getTime() - 86_400_000 + 1);
  return { date, startsAt, endsAt };
}

/** Covered or missing remaining points at a local day's end. */
function day(date: string, remainingPoints: number | null): SprintReportInput['days'][number] {
  return { date, endsAt: localDay(date).endsAt, remainingPoints };
}

/** The available input from the Sprint 14 snapshot. */
function reportInput(overrides: Partial<SprintReportInput> = {}): SprintReportInput {
  return {
    sprint: {
      listId: 'sprint-14',
      spaceId: 'produit',
      name: 'Sprint 14',
      startDate: '2026-11-03',
      endDate: '2026-11-09',
    },
    timing: {
      opensAt: localDay('2026-11-03').startsAt,
      closesAt: localDay('2026-11-09').endsAt,
      requestedDayEndsAt: localDay('2026-11-12').endsAt,
      serverObservedAt: new Date('2026-11-06T11:00:00Z'),
    },
    observedDay: localDay('2026-11-06'),
    coverageStartedAt: new Date('2026-11-02T23:00:00Z'),
    openingPoints: 20,
    observedTasks: [task({ customPoints: 4 })],
    days: [],
    trendDays: [],
    priorSprints: [],
    ...overrides,
  };
}

describe('sprintTaskPoints', () => {
  it.each([
    [null, 1],
    [0, 1],
    [60, 1],
    [61, 2],
    [180, 2],
    [181, 3],
    [360, 3],
    [361, 5],
    [600, 5],
    [601, 8],
  ])('assigns an estimate of %s minutes %s points', (estimateMinutes, points) => {
    expect(sprintTaskPoints(task({ estimateMinutes }))).toBe(points);
  });

  it('uses designated points including zero and fractional values', () => {
    expect(sprintTaskPoints(task({ estimateMinutes: 601, customPoints: 0 }))).toBe(0);
    expect(sprintTaskPoints(task({ estimateMinutes: 601, customPoints: 2.5 }))).toBe(2.5);
  });

  it.each([-1, Infinity, NaN])('refuses an invalid designated value %s', (customPoints) => {
    expect(() => sprintTaskPoints(task({ customPoints }))).toThrow(InvalidTaskError);
  });

  it('excludes subtasks, milestones and cancelled, archived or trashed tasks', () => {
    expect(sprintTaskPoints(task({ parentKey: TaskKey.parse('CAD-481') }))).toBeNull();
    expect(sprintTaskPoints(task({ milestone: true }))).toBeNull();
    expect(sprintTaskPoints(task({ status: 'cancelled' }))).toBeNull();
    expect(sprintTaskPoints(task({ archived: true }))).toBeNull();
    expect(sprintTaskPoints(task({ trashed: true }))).toBeNull();
  });
});

describe('sprintReportObservation', () => {
  it('clamps the observation to the supplied local end of the requested day', () => {
    expect(
      sprintReportObservation({
        opensAt: new Date('2026-03-28T23:00:00Z'),
        closesAt: new Date('2026-04-02T21:59:59.999Z'),
        requestedDayEndsAt: new Date('2026-03-29T21:59:59.999Z'),
        serverObservedAt: new Date('2026-03-31T12:00:00Z'),
      }),
    ).toEqual(new Date('2026-03-29T21:59:59.999Z'));
  });

  it('clamps the observation to sprint close', () => {
    expect(
      sprintReportObservation({
        ...reportInput().timing,
        serverObservedAt: new Date('2026-11-10T11:00:00Z'),
      }),
    ).toEqual(new Date('2026-11-09T22:59:59.999Z'));
  });

  it('refuses reversed sprint bounds', () => {
    expect(() =>
      sprintReportObservation({
        ...reportInput().timing,
        closesAt: localDay('2026-11-02').endsAt,
      }),
    ).toThrow(InvalidTaskError);
  });
});

describe('projectSprintReport', () => {
  it('computes totals across the whole current scope and retains six tasks in task-key order', () => {
    const delivered = [490, 489, 488, 487, 486, 485, 482, 9].map((number) =>
      task({ key: TaskKey.of('CAD', number), status: 'done', customPoints: number === 9 ? 0 : 2 }),
    );
    const report = projectSprintReport(
      reportInput({
        observedTasks: [
          ...delivered,
          task({ key: TaskKey.parse('CAD-491'), status: 'review', estimateMinutes: 180 }),
          task({ key: TaskKey.parse('CAD-492'), status: 'cancelled', customPoints: 500 }),
        ],
      }),
    );

    expect(report.openingPoints).toBe(20);
    expect(report.delivered).toMatchObject({ points: 14, taskCount: 8 });
    expect(report.delivered?.items.map(({ taskKey }) => taskKey)).toEqual([
      'CAD-9',
      'CAD-482',
      'CAD-485',
      'CAD-486',
      'CAD-487',
      'CAD-488',
    ]);
    expect(report.remaining).toEqual({
      points: 2,
      taskCount: 1,
      items: [{ taskKey: 'CAD-491', name: 'Revoir le formulaire', status: 'review', points: 2 }],
    });
  });

  it('distinguishes a covered zero from missing history, missing opening and future dates', () => {
    const report = projectSprintReport(
      reportInput({
        coverageStartedAt: new Date('2026-11-04T12:00:00Z'),
        observedTasks: [],
        days: [
          day('2026-11-03', 4),
          day('2026-11-04', 0),
          day('2026-11-05', null),
          day('2026-11-06', 12),
          day('2026-11-07', 9),
        ],
      }),
    );

    expect(report.observedAt).toEqual(new Date('2026-11-06T11:00:00Z'));
    expect(report.openingPoints).toBeNull();
    expect(report.delivered).toEqual({ points: 0, taskCount: 0, items: [] });
    expect(report.remaining).toEqual({ points: 0, taskCount: 0, items: [] });
    expect(report.items.map(({ actualRemainingPoints }) => actualRemainingPoints)).toEqual([
      null,
      0,
      null,
      0,
      null,
    ]);
    expect(report.items.every(({ idealRemainingPoints }) => idealRemainingPoints === null)).toBe(
      true,
    );
  });

  it('leaves opening and current scope unavailable before the baseline or when there is a gap', () => {
    const beforeCoverage = projectSprintReport(
      reportInput({ coverageStartedAt: new Date('2026-11-06T12:00:00Z') }),
    );
    const gap = projectSprintReport(reportInput({ openingPoints: null, observedTasks: null }));
    const noBaseline = projectSprintReport(reportInput({ coverageStartedAt: null }));

    for (const report of [beforeCoverage, gap, noBaseline]) {
      expect(report).toMatchObject({ openingPoints: null, delivered: null, remaining: null });
    }
  });

  it('does not show a commitment or an observation before sprint opening', () => {
    const observedDay = localDay('2026-11-02');
    const report = projectSprintReport(
      reportInput({
        observedDay,
        timing: { ...reportInput().timing, requestedDayEndsAt: observedDay.endsAt },
      }),
    );
    expect(report).toMatchObject({ openingPoints: null, delivered: null, remaining: null });
  });

  it('refuses an observation outside its supplied local day', () => {
    expect(() => projectSprintReport(reportInput({ observedDay: localDay('2026-11-05') }))).toThrow(
      InvalidTaskError,
    );
  });

  it('projects from the actual partial day using a positive rate outside the requested page', () => {
    const report = projectSprintReport(
      reportInput({
        observedTasks: [task({ customPoints: 10 })],
        days: [day('2026-11-06', 500), day('2026-11-07', null), day('2026-11-09', null)],
        trendDays: [day('2026-11-04', 13), day('2026-11-05', 11)],
      }),
    );

    expect(report.projectedRemainingPoints).toBeCloseTo(3);
    expect(report.items[0]).toMatchObject({
      actualRemainingPoints: 10,
      idealRemainingPoints: 10,
      projectedRemainingPoints: 10,
    });
    expect(report.items[1]?.projectedRemainingPoints).toBeCloseTo(7);
    expect(report.items[2]?.projectedRemainingPoints).toBeCloseTo(3);
    expect(report.items[2]?.idealRemainingPoints).toBe(0);
  });

  it('measures a partial day using its supplied 23-hour span', () => {
    const input = reportInput();
    const report = projectSprintReport({
      ...input,
      sprint: { ...input.sprint, startDate: '2026-03-27', endDate: '2026-03-30' },
      timing: {
        opensAt: new Date('2026-03-26T23:00:00Z'),
        closesAt: new Date('2026-03-30T21:59:59.999Z'),
        requestedDayEndsAt: new Date('2026-03-30T21:59:59.999Z'),
        serverObservedAt: new Date('2026-03-29T10:30:00Z'),
      },
      observedDay: {
        date: '2026-03-29',
        startsAt: new Date('2026-03-28T23:00:00Z'),
        endsAt: new Date('2026-03-29T21:59:59.999Z'),
      },
      coverageStartedAt: new Date('2026-03-26T23:00:00Z'),
      observedTasks: [task({ customPoints: 10 })],
      trendDays: [day('2026-03-27', 13), day('2026-03-28', 11)],
    });

    expect(report.projectedRemainingPoints).toBeCloseTo(7, 5);
  });

  it.each([null, 13, 14])(
    'leaves projections unavailable when a second observation of %s supplies no positive decline',
    (remainingPoints) => {
      const report = projectSprintReport(
        reportInput({
          trendDays: [day('2026-11-04', 13), day('2026-11-05', remainingPoints)],
        }),
      );
      expect(report.projectedRemainingPoints).toBeNull();
    },
  );

  it('ignores a purported end-of-day sample from the current partial day', () => {
    const report = projectSprintReport(
      reportInput({
        trendDays: [day('2026-11-04', 13), day('2026-11-06', 5)],
      }),
    );
    expect(report.projectedRemainingPoints).toBeNull();
  });

  it('sets the ideal on a single sprint day to zero at close', () => {
    const input = reportInput({ days: [day('2026-11-06', null)] });
    const report = projectSprintReport({
      ...input,
      sprint: { ...input.sprint, startDate: '2026-11-06', endDate: '2026-11-06' },
      timing: {
        ...input.timing,
        opensAt: input.observedDay.startsAt,
        closesAt: input.observedDay.endsAt,
      },
    });

    expect(report.items[0]?.idealRemainingPoints).toBe(0);
  });

  it('preserves actuals but drops forecasts for a sprint already closed at server observation', () => {
    const report = projectSprintReport(
      reportInput({
        timing: {
          ...reportInput().timing,
          requestedDayEndsAt: localDay('2026-11-06').endsAt,
          serverObservedAt: new Date('2026-11-10T11:00:00Z'),
        },
        trendDays: [day('2026-11-04', 13), day('2026-11-05', 11)],
        days: [day('2026-11-06', 4)],
      }),
    );

    expect(report.items[0]?.actualRemainingPoints).toBe(4);
    expect(report.projectedRemainingPoints).toBeNull();
  });

  it('selects the last four completed sprints in the space by close date and ID', () => {
    const input = reportInput();
    const base = {
      ...input.sprint,
      name: 'Sprint précédent',
      startDate: '2026-10-03',
      endDate: '2026-11-01',
      openingPoints: 0,
      deliveredPoints: null,
    };
    const report = projectSprintReport({
      ...input,
      priorSprints: [
        { ...base, listId: 's13' },
        { ...base, listId: 's10', endDate: '2026-10-20', openingPoints: null, deliveredPoints: 0 },
        { ...base, listId: 's12' },
        { ...base, listId: 's9', endDate: '2026-10-10' },
        { ...base, listId: 'other-space', spaceId: 'design', endDate: '2026-11-02' },
        { ...base, listId: 'overlap', endDate: input.sprint.startDate },
        { ...base, listId: 's11', endDate: '2026-10-25' },
      ],
    });

    expect(report.velocity.map(({ listId }) => listId)).toEqual(['s10', 's11', 's12', 's13']);
    expect(report.velocity[0]).toEqual({
      listId: 's10',
      name: 'Sprint précédent',
      startDate: '2026-10-03',
      endDate: '2026-10-20',
      openingPoints: null,
      deliveredPoints: 0,
    });
  });
});
