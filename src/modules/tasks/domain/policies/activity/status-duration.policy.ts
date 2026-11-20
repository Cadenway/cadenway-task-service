import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import type { StatusDurationSummary } from '../../value-objects/activity/status-duration-summary.value-object.js';
import type { StatusHistoryEntry } from '../../value-objects/activity/status-history-entry.value-object.js';
import { isClosedStatus } from '../../value-objects/task/status-category.value-object.js';
import type { StatusKey } from '../../value-objects/task/status-key.value-object.js';
import type { TaskState } from '../../value-objects/task/task-state.value-object.js';

/** Adds elapsed time and moves the status to the position of its newly measured oldest visit. */
function addDuration(totals: Map<StatusKey, number>, status: StatusKey, elapsed: number): void {
  const total: number = (totals.get(status) ?? 0) + elapsed;
  totals.delete(status);
  totals.set(status, total);
}

/**
 * Measures the reliable suffix of an ordinary task's activity (`getTaskStatusDurationsInternal`).
 * Facts arrive newest first by `(occurredAt,id)`. Only one total per status is retained as the
 * history is read into the past. An unknown initial status or a broken link bounds coverage.
 */
export class StatusDurationHistory {
  // #region Properties
  /** The current status from the same snapshot as the history. */
  private readonly currentStatus: StatusKey;

  /** The task's stored creation instant in milliseconds. */
  private readonly createdAt: number;

  /** The server observation instant in milliseconds. */
  private readonly observedAt: number;

  /** Elapsed time by status, newest first by oldest measured visit. */
  private readonly totals: Map<StatusKey, number>;

  /** The expected status ending immediately after the next older boundary. */
  private expectedStatus: StatusKey;

  /** The oldest measured transition instant, or the observation before measuring any. */
  private boundary: number;

  /** The ID at the last measured transition, used to verify equal-time ordering. */
  private boundaryId: string | null = null;

  /** Creation is accepted only once the scan establishes that no older fact exists. */
  private scan: 'open' | 'creation' | 'closed' = 'open';
  // #endregion

  // #region Constructor
  /** Starts a scan from the observed task state and an explicit valid server instant. */
  public constructor(task: Pick<TaskState, 'status' | 'createdAt'>, observedAt: Date) {
    this.createdAt = task.createdAt.getTime();
    this.observedAt = observedAt.getTime();
    if (!Number.isFinite(this.observedAt)) {
      throw new InvalidTaskError('the status history observation is a valid date');
    }
    this.currentStatus = task.status;
    this.expectedStatus = task.status;
    this.boundary = this.observedAt;
    this.totals = new Map([[task.status, 0]]);
  }
  // #endregion

  // #region Methods
  /** Includes a fact and returns whether to keep reading older facts across page boundaries. */
  public include(entry: StatusHistoryEntry): boolean {
    const instant: number = entry.occurredAt.getTime();
    if (this.scan === 'open' && this.isEarlierFact(instant, entry.id)) {
      // The creation activity clock and the task row round their milliseconds differently.
      if (
        entry.change.kind === 'create' &&
        entry.initialStatus === this.expectedStatus &&
        this.createdAt <= this.boundary
      ) {
        this.scan = 'creation';
        return true;
      }
      if (
        entry.change.kind === 'status' &&
        entry.change.status.to === this.expectedStatus &&
        instant >= this.createdAt
      ) {
        addDuration(this.totals, this.expectedStatus, this.boundary - instant);
        this.boundary = instant;
        this.boundaryId = entry.id;
        this.expectedStatus = entry.change.status.from;
        return true;
      }
    }

    this.scan = 'closed';
    return false;
  }

  /** Returns the measured suffix after the scan stops or exhausts all matching facts. */
  public summarize(): StatusDurationSummary {
    const complete: boolean = this.scan === 'creation';
    const totals = new Map<StatusKey, number>(this.totals);
    const coverage: number = complete ? this.createdAt : this.boundary;
    if (complete) {
      addDuration(totals, this.expectedStatus, this.boundary - coverage);
    }

    return {
      observedAt: new Date(this.observedAt),
      coverageStartedAt: new Date(coverage),
      complete,
      durations: [...totals].reverse().map(([status, durationMilliseconds]) => ({
        status,
        durationMilliseconds,
        active: status === this.currentStatus && !isClosedStatus(status),
      })),
    };
  }

  /** Refuses unusable dates and facts whose order crosses the current boundary. */
  private isEarlierFact(instant: number, id: string): boolean {
    return (
      instant < this.boundary ||
      (instant === this.boundary && (this.boundaryId === null || id < this.boundaryId))
    );
  }
  // #endregion
}
