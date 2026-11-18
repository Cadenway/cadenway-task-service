/**
 * Interface RawTaskPageRow
 *
 * @description
 * A row of a page of tasks as `db.execute` returns it: the columns a summary reads under their
 * property names, the instants as ISO 8601 text in UTC and the dates as text, so no driver type
 * parser decides how they are read, and the value the order sorts by.
 */
export interface RawTaskPageRow {
  // #region Properties
  /** Id of the task. */
  readonly id: string;

  /** Prefix of the key. */
  readonly keyPrefix: string;

  /** Number of the key. */
  readonly keyNumber: number;

  /** Name of the task. */
  readonly name: string;

  /** Stored status. */
  readonly status: string;

  /** Stored reason of the cancellation. */
  readonly cancelReason: string | null;

  /** Stored priority. */
  readonly priority: string;

  /** Due date as `YYYY-MM-DD`. */
  readonly dueDate: string | null;

  /** Start date as `YYYY-MM-DD`. */
  readonly startDate: string | null;

  /** Estimate in minutes. */
  readonly estimateMinutes: number | null;

  /** Completion instant as ISO 8601 text in UTC. */
  readonly completedAt: string | null;

  /** Creation instant as ISO 8601 text in UTC. */
  readonly createdAt: string;

  /** The list of the task. */
  readonly listId: string;

  /** The space of the list. */
  readonly spaceId: string;

  /** The parent of a subtask. */
  readonly parentId: string | null;

  /** Version of the task. */
  readonly version: number;

  /** What the order sorts by: `null`, a due date, a rank or a folded prefix. */
  readonly sortValue: string | number | null;
  // #endregion
}
