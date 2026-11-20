import type { SprintReportTaskSnapshot } from './sprint-report-task-snapshot.value-object.js';

/** The remaining points at one local day's end. Null means the observation is unavailable. */
interface SprintObservedDay {
  // #region Properties
  /** The local calendar date. */
  readonly date: string;

  /** The inclusive last observable instant, or null if the zone skipped this date. */
  readonly endsAt: Date | null;

  /** The covered remaining points at that instant, or null. */
  readonly remainingPoints: number | null;
  // #endregion
}

/** Report inputs from one read of the durable, caller-visible history. */
export interface SprintReportInput {
  // #region Properties
  /** The caller-visible sprint with its inclusive local dates. */
  readonly sprint: {
    readonly listId: string;
    readonly spaceId: string;
    readonly name: string;
    readonly startDate: string;
    readonly endDate: string;
  };

  /** Cutoffs in the IANA zone. Ends are inclusive; an entirely skipped sprint has no opening. */
  readonly timing: {
    readonly opensAt: Date | null;
    readonly closesAt: Date;
    readonly requestedDayEndsAt: Date;
    readonly serverObservedAt: Date;
  };

  /** Bounds of the local day containing the computed observation cutoff. */
  readonly observedDay: {
    readonly date: string;
    readonly startsAt: Date;
    readonly endsAt: Date;
  };

  /** Start of reliable history. Null means there is no baseline. */
  readonly coverageStartedAt: Date | null;

  /** Opening commitment aggregated from task points, or null for a gap at the opening instant. */
  readonly openingPoints: number | null;

  /** Visible tasks at the observation cutoff. Null signals a gap and an empty iterable is covered. */
  readonly observedTasks: Iterable<SprintReportTaskSnapshot> | null;

  /** A chronological page of dates within the sprint, with available end-of-day points. */
  readonly days: readonly SprintObservedDay[];

  /** The two most recent covered end-of-day observations, independent of the requested page. */
  readonly trendDays: readonly SprintObservedDay[];

  /** Readable completed sprints and their independently reconstructed commitments and deliveries. */
  readonly priorSprints: readonly {
    readonly listId: string;
    readonly spaceId: string;
    readonly name: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly openingPoints: number | null;
    readonly deliveredPoints: number | null;
  }[];
  // #endregion
}
