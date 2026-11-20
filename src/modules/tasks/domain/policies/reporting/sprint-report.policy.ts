import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import type { SprintReportInput } from '../../value-objects/reporting/sprint-report-input.value-object.js';
import type { SprintReportProjection } from '../../value-objects/reporting/sprint-report-projection.value-object.js';
import type { SprintReportTaskSnapshot } from '../../value-objects/reporting/sprint-report-task-snapshot.value-object.js';
import { CalendarDate } from '../../value-objects/task/calendar-date.value-object.js';
import type { TaskKey } from '../../value-objects/task/task-key.value-object.js';

type SprintReportBreakdown = NonNullable<SprintReportProjection['delivered']>;

/** Applies the cutoffs of the public getSprintReport contract without consulting a clock. */
export function sprintReportObservation(timing: SprintReportInput['timing']): Date {
  const { opensAt, closesAt, requestedDayEndsAt, serverObservedAt } = timing;
  const cutoff = Math.min(
    closesAt.getTime(),
    requestedDayEndsAt.getTime(),
    serverObservedAt.getTime(),
  );
  if (!Number.isFinite(cutoff) || !Number.isFinite(opensAt.getTime()) || closesAt < opensAt) {
    throw new InvalidTaskError('a sprint report uses valid observation bounds');
  }
  return new Date(cutoff);
}

/** Gives a visible sprint task its historical contribution under the getSprintReport contract. */
export function sprintTaskPoints(task: SprintReportTaskSnapshot): number | null {
  if (
    task.parentKey ||
    task.milestone ||
    task.archived ||
    task.trashed ||
    task.status === 'cancelled'
  ) {
    return null;
  }
  if (task.customPoints !== null) {
    if (!Number.isFinite(task.customPoints) || task.customPoints < 0) {
      throw new InvalidTaskError('designated sprint points are finite and nonnegative');
    }
    return task.customPoints;
  }

  const estimate = task.estimateMinutes ?? 0;
  if (estimate <= 60) return 1;
  if (estimate <= 180) return 2;
  if (estimate <= 360) return 3;
  if (estimate <= 600) return 5;
  return 8;
}

/** Sorts canonical ASCII keys by prefix and then numeric sequence. */
function compareTaskKeys(left: TaskKey, right: TaskKey): number {
  if (left.prefix === right.prefix) return left.number - right.number;
  return left.prefix < right.prefix ? -1 : 1;
}

/** Computes both breakdowns in one pass, keeping only six task previews for each. */
function summarizeTasks(tasks: Iterable<SprintReportTaskSnapshot> | null): {
  delivered: SprintReportBreakdown | null;
  remaining: SprintReportBreakdown | null;
} {
  if (tasks === null) return { delivered: null, remaining: null };

  type Preview = [task: SprintReportTaskSnapshot, points: number];
  const delivered = { points: 0, taskCount: 0, items: new Array<Preview>() };
  const remaining = { points: 0, taskCount: 0, items: new Array<Preview>() };
  for (const task of tasks) {
    const points = sprintTaskPoints(task);
    if (points === null) continue;

    const part = task.status === 'done' ? delivered : remaining;
    part.points += points;
    part.taskCount += 1;
    part.items.push([task, points]);
    part.items.sort(([left], [right]) => compareTaskKeys(left.key, right.key));
    if (part.items.length > 6) part.items.pop();
  }
  const result = (part: typeof delivered): SprintReportBreakdown => ({
    ...part,
    items: part.items.map(([task, points]) => ({
      taskKey: task.key.format(),
      name: task.name,
      status: task.status,
      points,
    })),
  });
  return { delivered: result(delivered), remaining: result(remaining) };
}

/** Computes a decline in points per local calendar day from covered complete days. */
function burnRate(input: SprintReportInput, observedAt: Date): number | null {
  const coverage = input.coverageStartedAt;
  if (coverage === null || input.timing.serverObservedAt >= input.timing.closesAt) return null;

  const [earlier, later] = input.trendDays
    .filter(
      (day) =>
        day.remainingPoints !== null &&
        day.date >= input.sprint.startDate &&
        day.date <= input.sprint.endDate &&
        day.endsAt >= coverage &&
        day.endsAt <= observedAt,
    )
    .toSorted((a, b) => a.date.localeCompare(b.date))
    .slice(-2);
  if (
    !earlier ||
    !later ||
    earlier.remainingPoints === null ||
    later.remainingPoints === null ||
    earlier.date === later.date ||
    earlier.remainingPoints <= later.remainingPoints
  ) {
    return null;
  }

  const elapsed = CalendarDate.parse(earlier.date).daysUntil(CalendarDate.parse(later.date));
  return (earlier.remainingPoints - later.remainingPoints) / elapsed;
}

/** The position of the observation on the calendar axis, including a partial local day. */
function observationDayFraction(day: SprintReportInput['observedDay'], observedAt: Date): number {
  const offset = observedAt.getTime() - day.startsAt.getTime();
  const duration = day.endsAt.getTime() - day.startsAt.getTime();
  if (!Number.isFinite(offset) || !Number.isFinite(duration) || offset < 0 || offset > duration) {
    throw new InvalidTaskError('the sprint report observation belongs to its supplied local day');
  }
  return offset / Math.max(1, duration);
}

/** Chooses up to four earlier same-space sprints, ordered by close date and ID. */
function sprintVelocity(input: SprintReportInput): SprintReportProjection['velocity'] {
  return input.priorSprints
    .filter(
      (sprint) =>
        sprint.spaceId === input.sprint.spaceId && sprint.endDate < input.sprint.startDate,
    )
    .toSorted((a, b) => a.endDate.localeCompare(b.endDate) || a.listId.localeCompare(b.listId))
    .slice(-4)
    .map(({ listId, name, startDate, endDate, openingPoints, deliveredPoints }) => ({
      listId,
      name,
      startDate,
      endDate,
      openingPoints,
      deliveredPoints,
    }));
}

/**
 * Projects the public getSprintReport contract over covered history. The caller applies current
 * visibility and excludes purged tasks at every observation, including opening and velocity.
 */
export function projectSprintReport(input: SprintReportInput): SprintReportProjection {
  const { sprint, timing, observedDay, coverageStartedAt } = input;
  const observedAt = sprintReportObservation(timing);
  const { opensAt } = timing;
  const hasOpened = opensAt <= observedAt;
  const openingPoints =
    hasOpened && coverageStartedAt !== null && coverageStartedAt <= opensAt
      ? input.openingPoints
      : null;
  const { delivered, remaining } = summarizeTasks(
    hasOpened && coverageStartedAt !== null && coverageStartedAt <= observedAt
      ? input.observedTasks
      : null,
  );

  const startDay = CalendarDate.parse(sprint.startDate);
  const elapsedAtEnd = startDay.daysUntil(CalendarDate.parse(sprint.endDate));
  if (elapsedAtEnd < 0) {
    throw new InvalidTaskError('a sprint report ends on or after its start date');
  }
  const observedDate = observedDay.date;
  const observationPosition =
    startDay.daysUntil(CalendarDate.parse(observedDate)) +
    observationDayFraction(observedDay, observedAt);
  const rate = burnRate(input, observedAt);
  const forecast = (position: number): number | null => {
    if (rate === null || remaining === null) return null;
    return Math.max(0, remaining.points - rate * (position - observationPosition));
  };

  const items = input.days.map((day) => {
    const { endsAt } = day;
    const elapsed = startDay.daysUntil(CalendarDate.parse(day.date));
    let actualRemainingPoints: number | null = null;
    if (endsAt > observedAt && day.date === observedDate) {
      actualRemainingPoints = remaining?.points ?? null;
    } else if (endsAt <= observedAt && coverageStartedAt !== null && coverageStartedAt <= endsAt) {
      actualRemainingPoints = day.remainingPoints;
    }
    return {
      date: day.date,
      actualRemainingPoints,
      idealRemainingPoints:
        openingPoints === null
          ? null
          : openingPoints * ((elapsedAtEnd - elapsed) / Math.max(1, elapsedAtEnd)),
      projectedRemainingPoints:
        day.date < observedDate
          ? null
          : forecast(day.date === observedDate ? observationPosition : elapsed + 1),
    };
  });

  return {
    listId: sprint.listId,
    name: sprint.name,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    observedAt,
    coverageStartedAt,
    openingPoints,
    delivered,
    remaining,
    projectedRemainingPoints: forecast(elapsedAtEnd + 1),
    items,
    velocity: sprintVelocity(input),
  };
}
