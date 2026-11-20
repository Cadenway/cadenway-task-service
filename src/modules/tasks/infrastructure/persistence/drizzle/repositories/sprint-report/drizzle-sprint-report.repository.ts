import { Temporal } from 'temporal-polyfill';

import type { SprintReportHistory } from '../../../../../application/models/reporting/sprint-report-history.model.js';
import type { SprintReportRead } from '../../../../../application/models/reporting/sprint-report-read.model.js';
import type { SprintReportSnapshot } from '../../../../../application/models/reporting/sprint-report-snapshot.model.js';
import type { SprintReportReader } from '../../../../../application/ports/outbound/persistence/reporting/sprint-report-reader.port.js';
import { SprintHistory } from '../../../../../domain/policies/reporting/sprint-history.policy.js';
import {
  sprintReportObservation,
  sprintTaskPoints,
} from '../../../../../domain/policies/reporting/sprint-report.policy.js';
import type { SprintHistoryInput } from '../../../../../domain/value-objects/reporting/sprint-history-input.value-object.js';
import type { SprintReportInput } from '../../../../../domain/value-objects/reporting/sprint-report-input.value-object.js';
import type { SprintReportTaskSnapshot } from '../../../../../domain/value-objects/reporting/sprint-report-task-snapshot.value-object.js';
import { toStatusKey } from '../../mappers/task/task-values.mapper.js';
import type { DrizzleSprintHistoryRepository } from '../sprint-history/drizzle-sprint-history.repository.js';
import {
  sprintCalendarPage,
  sprintLocalDay,
  sprintObservedDay,
  sprintTrendDates,
} from './sprint-report-calendar.repository.js';

type Sprint = SprintReportInput['sprint'];
interface Interval {
  // #region Properties
  /** A period when the sprint exists in its space. */
  readonly startsAt: Date;
  readonly endsBefore: Date | null;
  // #endregion
}
type SprintScope = Sprint & { readonly intervals: readonly Interval[] };
type CalendarDay = ReturnType<typeof sprintLocalDay>;
interface PointSummary {
  // #region Properties
  /** Aggregated point totals or null if the historical state has a gap. */
  total: number | null;
  remaining: number | null;
  delivered: number | null;
  // #endregion
}

/** Metadata resolved through Spaces within the same tenant snapshot as the task history. */
interface SprintReportMetadata {
  // #region Properties
  /** Cutover and authorized list histories. */
  readonly coverageStartedAt: Date | null;
  readonly current: SprintScope;
  readonly prior: readonly SprintScope[];
  // #endregion
}

/**
 * Resolves capture activation and readable list lifecycle outside the Tasks database adapter.
 * The implementation must use the caller's current tenant transaction and Spaces public entries.
 */
type ResolveSprintMetadata = (
  organizationId: string,
  request: SprintReportRead,
  snapshot: string,
) => Promise<SprintReportMetadata>;

/** Pages facts by their monotonic sequence without loading an unbounded SQL result. */
async function readFacts<T extends { readonly sequence: bigint }>(
  read: (after: bigint | null) => Promise<readonly T[]>,
): Promise<T[]> {
  const facts: T[] = [];
  let after: bigint | null = null;
  for (;;) {
    const page = await read(after);
    facts.push(...page);
    if (page.length < 500) return facts;
    const next = page.at(-1)?.sequence;
    if (next === undefined || next === after) throw new Error('Sprint history did not advance.');
    after = next;
  }
}

/** Computes local covered intervals for the latest two complete trend observations. */
function trendIntervals(
  scope: SprintScope,
  coverage: Date | null,
  zone: string,
): {
  readonly startDate: string;
  readonly endDate: string;
}[] {
  if (coverage === null) return [];
  return scope.intervals.flatMap((interval) => {
    const start = new Date(Math.max(interval.startsAt.getTime(), coverage.getTime()));
    const firstLocal = sprintObservedDay(start, zone);
    const first =
      firstLocal.endsAt >= start
        ? firstLocal.date
        : Temporal.PlainDate.from(firstLocal.date).add({ days: 1 }).toString();
    const lastDay =
      interval.endsBefore === null
        ? null
        : sprintObservedDay(new Date(interval.endsBefore.getTime() - 1), zone);
    const last =
      lastDay === null
        ? scope.endDate
        : lastDay.endsAt < (interval.endsBefore ?? lastDay.endsAt)
          ? lastDay.date
          : Temporal.PlainDate.from(lastDay.date).subtract({ days: 1 }).toString();
    const startDate = first > scope.startDate ? first : scope.startDate;
    const endDate = last < scope.endDate ? last : scope.endDate;
    return startDate <= endDate ? [{ startDate, endDate }] : [];
  });
}

/** Tests whether the sprint list existed at this instant. */
function activeAt(scope: SprintScope, cutoff: Date): boolean {
  return scope.intervals.some(
    ({ startsAt, endsBefore }) =>
      startsAt <= cutoff && (endsBefore === null || cutoff < endsBefore),
  );
}

/** Applies the task domain's point rule to a covered observation. */
function addPoints(total: PointSummary, tasks: Iterable<SprintReportTaskSnapshot> | null): void {
  if (tasks === null) {
    total.total = null;
    total.remaining = null;
    total.delivered = null;
    return;
  }
  if (total.total === null || total.remaining === null || total.delivered === null) return;
  for (const task of tasks) {
    const points = sprintTaskPoints(task);
    if (points === null) continue;
    total.total += points;
    if (task.status === 'done') total.delivered += points;
    else total.remaining += points;
  }
}

/**
 * Composes bounded tenant-scoped history pages into one sprint-report input. Current visibility
 * and physical deletion are rechecked by the underlying history repository on every page.
 */
export class DrizzleSprintReportRepository implements SprintReportReader {
  // #region Constructor
  /** Binds task history and the owning Spaces metadata to the caller's read transaction. */
  public constructor(
    private readonly history: DrizzleSprintHistoryRepository,
    private readonly metadata: ResolveSprintMetadata,
  ) {}
  // #endregion

  // #region Methods
  /** Resolves calendar cutoffs and projects covered task states for every requested sprint. */
  public async read(
    organizationId: string,
    request: SprintReportRead,
  ): Promise<SprintReportHistory> {
    const snapshot =
      request.snapshot ?? ((await this.history.captureObservation()) as SprintReportSnapshot);
    const metadata = await this.metadata(organizationId, request, snapshot);
    const { current, prior, coverageStartedAt } = metadata;
    if (
      current.listId !== request.sprint.listId ||
      current.spaceId !== request.sprint.spaceId ||
      prior.length > 4 ||
      prior.some((sprint) => sprint.spaceId !== current.spaceId)
    ) {
      throw new Error('Sprint metadata must match the authorized report scope.');
    }
    const page = sprintCalendarPage(
      current.startDate,
      current.endDate,
      request.after,
      request.limit,
      request.timeZone,
    );
    const timing = {
      opensAt: sprintLocalDay(current.startDate, request.timeZone).startsAt,
      closesAt: sprintLocalDay(current.endDate, request.timeZone).endsAt,
      requestedDayEndsAt: sprintLocalDay(request.today, request.timeZone).endsAt,
      serverObservedAt: request.serverObservedAt,
    };
    const observedAt = sprintReportObservation(timing);
    const trendDays = sprintTrendDates(
      trendIntervals(current, coverageStartedAt, request.timeZone),
      observedAt,
      request.timeZone,
    );
    const scopes = [current, ...prior];
    const cutoffs = new Map<string, { scope: SprintScope; instant: Date; summary: PointSummary }>();
    const key = (scope: SprintScope, instant: Date): string =>
      `${scope.listId}/${String(instant.getTime())}`;
    const addCutoff = (scope: SprintScope, instant: Date): void => {
      const covered =
        coverageStartedAt !== null && coverageStartedAt <= instant && activeAt(scope, instant);
      cutoffs.set(key(scope, instant), {
        scope,
        instant,
        summary: {
          total: covered ? 0 : null,
          remaining: covered ? 0 : null,
          delivered: covered ? 0 : null,
        },
      });
    };
    addCutoff(current, timing.opensAt);
    addCutoff(current, observedAt);
    for (const day of [...page.days, ...trendDays]) addCutoff(current, day.endsAt);
    for (const sprint of prior) {
      addCutoff(sprint, sprintLocalDay(sprint.startDate, request.timeZone).startsAt);
      addCutoff(sprint, sprintLocalDay(sprint.endDate, request.timeZone).endsAt);
    }

    const fields: SprintHistoryInput['currentFields'][number][] = [];
    let afterField: string | null = null;
    for (;;) {
      const batch = await this.history.currentFields(
        organizationId,
        current.spaceId,
        afterField,
        500,
      );
      fields.push(...batch);
      if (batch.length < 500) break;
      afterField = batch.at(-1)?.fieldId ?? null;
      if (afterField === null) throw new Error('Sprint field pagination did not advance.');
    }
    const fieldFacts = await readFacts((after) =>
      this.history.fieldFacts(
        organizationId,
        current.spaceId,
        request.serverObservedAt,
        snapshot,
        after,
        500,
      ),
    );
    const observedTasks: SprintReportTaskSnapshot[] = [];
    const sprintIds = [...new Set(scopes.map((scope) => scope.listId))];
    const visibleListIds = [...new Set(request.visibleListIds)];
    for (let listOffset = 0; listOffset < visibleListIds.length; listOffset += 500) {
      const visibleLists = visibleListIds.slice(listOffset, listOffset + 500);
      let afterTask: string | null = null;
      for (;;) {
        const ids = await this.history.candidates(
          organizationId,
          sprintIds,
          visibleLists,
          afterTask,
          500,
        );
        if (ids.length === 0) break;
        const currentTasks = await this.history.currentTasks(organizationId, ids, visibleLists);
        const taskFacts = await readFacts((after) =>
          this.history.taskFacts(
            organizationId,
            ids,
            visibleLists,
            request.serverObservedAt,
            snapshot,
            after,
            500,
          ),
        );
        const valueFacts = await readFacts((after) =>
          this.history.valueFacts(
            organizationId,
            ids,
            visibleLists,
            request.serverObservedAt,
            snapshot,
            after,
            500,
          ),
        );
        const currentValues: SprintHistoryInput['currentValues'][number][] = [];
        let afterValue: { readonly taskId: string; readonly fieldId: string } | null = null;
        for (;;) {
          const values = await this.history.currentValues(
            organizationId,
            ids,
            visibleLists,
            afterValue,
            500,
          );
          currentValues.push(...values);
          if (values.length < 500) break;
          const last = values.at(-1);
          if (last === undefined) throw new Error('Sprint value pagination did not advance.');
          afterValue = { taskId: last.taskId, fieldId: last.fieldId };
        }
        const reconstruction = new SprintHistory({
          coverageStartedAt,
          currentTasks,
          currentFields: fields,
          currentValues,
          taskFacts: taskFacts.map((fact) => ({
            ...fact,
            status: toStatusKey(fact.status, 'sprint history task'),
          })),
          fieldFacts,
          valueFacts,
        });
        for (const entry of cutoffs.values()) {
          if (entry.summary.total === null) continue;
          const tasks = reconstruction.at(entry.scope, entry.instant);
          addPoints(entry.summary, tasks);
          if (
            entry.scope.listId === current.listId &&
            entry.instant.getTime() === observedAt.getTime() &&
            tasks !== null
          ) {
            observedTasks.push(...tasks);
          }
        }
        if (ids.length < 500) break;
        const last = ids.at(-1);
        if (last === undefined || last === afterTask)
          throw new Error('Sprint task pagination did not advance.');
        afterTask = last;
      }
    }
    const summary = (scope: SprintScope, instant: Date): PointSummary => {
      const value = cutoffs.get(key(scope, instant))?.summary;
      if (value === undefined) throw new Error('Sprint observation was not scheduled.');
      return value;
    };
    const dayResult = (day: CalendarDay): SprintReportInput['days'][number] => ({
      date: day.date,
      endsAt: day.endsAt,
      remainingPoints: summary(current, day.endsAt).remaining,
    });
    return {
      snapshot,
      next: page.next,
      input: {
        sprint: current,
        timing,
        observedDay: sprintObservedDay(observedAt, request.timeZone),
        coverageStartedAt,
        openingPoints: summary(current, timing.opensAt).total,
        observedTasks: summary(current, observedAt).total === null ? null : observedTasks,
        days: page.days.map(dayResult),
        trendDays: trendDays.map(dayResult),
        priorSprints: prior.map((sprint) => ({
          ...sprint,
          openingPoints: summary(
            sprint,
            sprintLocalDay(sprint.startDate, request.timeZone).startsAt,
          ).total,
          deliveredPoints: summary(sprint, sprintLocalDay(sprint.endDate, request.timeZone).endsAt)
            .delivered,
        })),
      },
    };
  }
  // #endregion
}
