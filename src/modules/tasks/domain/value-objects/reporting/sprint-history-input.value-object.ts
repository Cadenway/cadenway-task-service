import type { StatusKey } from '../task/status-key.value-object.js';
import type { TaskKey } from '../task/task-key.value-object.js';

/** Full task state carried by each history fact. */
interface TaskFactState {
  // #region Properties
  /** Immutable task identity. */
  readonly taskId: string;
  readonly listId: string;
  readonly spaceId: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly status: StatusKey;
  readonly estimateMinutes: number | null;
  readonly milestone: boolean;
  readonly archivedAt: Date | null;
  readonly trashEntryId: string | null;
  // #endregion
}

/** A numeric field's selection and life cycle state. */
interface FieldFactState {
  // #region Properties
  /** Stable field and owning space IDs. */
  readonly spaceId: string;
  readonly fieldId: string;
  readonly designated: boolean;
  readonly retiredAt: Date | null;
  // #endregion
}

/** A numeric value or explicit removal for a task and field. */
interface ValueFactState {
  // #region Properties
  /** The task and field identities. */
  readonly taskId: string;
  readonly fieldId: string;
  readonly numberValue: number | null;
  // #endregion
}

/** One position in a fact ledger. A baseline is always effective at global coverage start. */
interface FactPosition {
  // #region Properties
  /** The observed write time and deterministic tie-breaker. */
  readonly recordedAt: Date;
  readonly sequence: bigint;
  readonly baseline: boolean;
  // #endregion
}

/** Evidence that a current row can be used as a lazy baseline. */
interface UnchangedRow {
  // #region Properties
  /** The reader found no changes for this key, even outside the report's frozen snapshot. */
  readonly unchangedSinceCoverage: boolean;
  // #endregion
}

/**
 * Caller-visible facts for one bounded batch of current, nonpurged tasks. Facts must share the
 * report's observation snapshot. Lazy baselines captured later can still contribute.
 */
export interface SprintHistoryInput {
  // #region Properties
  /** Global start of reliable historical capture, or null before activation. */
  readonly coverageStartedAt: Date | null;

  /** Existing caller-visible tasks and stable keys; current state is used only as a lazy baseline. */
  readonly currentTasks: readonly (TaskFactState &
    UnchangedRow & { readonly key: TaskKey; readonly createdAt: Date })[];

  /** Numeric field definitions, including retired definitions, in the evaluated spaces. */
  readonly currentFields: readonly (FieldFactState & UnchangedRow & { readonly createdAt: Date })[];

  /** Existing numeric values for these tasks, used only if proved unchanged. */
  readonly currentValues: readonly (ValueFactState & UnchangedRow)[];

  /** Captured task state and lazy baseline facts. */
  readonly taskFacts: readonly (TaskFactState & FactPosition)[];

  /** Captured numeric field designation and retirement facts. */
  readonly fieldFacts: readonly (FieldFactState & FactPosition)[];

  /** Captured numeric value writes and removals. */
  readonly valueFacts: readonly (ValueFactState & FactPosition)[];
  // #endregion
}
