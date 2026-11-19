/**
 * Interface RawTrashEntryRow
 *
 * @description
 * A row of the reads of `trash_entries` with the key, name and status of the root
 * (`trash-statements.mapper.ts`), as the driver returns it: the instants as ISO 8601 texts in UTC.
 */
export interface RawTrashEntryRow {
  // #region Properties
  /** Id of the entry. */
  readonly id: string;

  /** Its organization. */
  readonly organizationId: string;

  /** Its root. */
  readonly rootTaskId: string;

  /** Its list. */
  readonly listId: string;

  /** The parent key of its root as it read, or `null`. */
  readonly parentKey: string | null;

  /** Its tasks, the root included. */
  readonly taskCount: number;

  /** When it was made. */
  readonly trashedAt: string;

  /** The type of who made it. */
  readonly trashedByType: string;

  /** The id of who made it. */
  readonly trashedById: string;

  /** When "Vider la corbeille" handed it over, or `null`. */
  readonly purgeRequestedAt: string | null;

  /** The type of who handed it over, or `null`. */
  readonly purgeRequestedByType: string | null;

  /** The id of who handed it over, or `null`. */
  readonly purgeRequestedById: string | null;

  /** The prefix of the key of the root. */
  readonly rootKeyPrefix: string;

  /** The number of the key of the root. */
  readonly rootKeyNumber: number;

  /** The name of the root. */
  readonly rootName: string;

  /** The status of the root. */
  readonly rootStatus: string;
  // #endregion
}
