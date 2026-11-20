import type { StatusKey } from '../task/status-key.value-object.js';
import type { SprintReportInput } from './sprint-report-input.value-object.js';

/** Point and task totals with the first six tasks in task-key order. */
interface SprintReportBreakdown {
  // #region Properties
  /** Total points across the part of the sprint scope. */
  readonly points: number;
  readonly taskCount: number;
  readonly items: readonly {
    readonly taskKey: string;
    readonly name: string;
    readonly points: number;
    readonly status: StatusKey;
  }[];
  // #endregion
}

/** Sprint report data before transport serialization and cursor handling. */
export interface SprintReportProjection {
  // #region Properties
  /** The reported sprint's list ID. */
  readonly listId: string;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly observedAt: Date;
  readonly coverageStartedAt: Date | null;
  readonly openingPoints: number | null;
  readonly delivered: SprintReportBreakdown | null;
  readonly remaining: SprintReportBreakdown | null;
  readonly projectedRemainingPoints: number | null;
  readonly items: readonly {
    readonly date: string;
    readonly actualRemainingPoints: number | null;
    readonly idealRemainingPoints: number | null;
    readonly projectedRemainingPoints: number | null;
  }[];
  readonly velocity: readonly Omit<SprintReportInput['priorSprints'][number], 'spaceId'>[];
  // #endregion
}
