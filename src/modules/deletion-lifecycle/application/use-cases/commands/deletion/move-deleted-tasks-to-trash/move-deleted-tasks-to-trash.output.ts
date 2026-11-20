/**
 * Interface MoveDeletedTasksToTrashOutput
 *
 * @description
 * How the move of the tasks of a deleted list or space to the trash ended, with counts only.
 */
export interface MoveDeletedTasksToTrashOutput {
  // #region Properties
  /**
   * `completed` once every deleted list of the target holds no top-level task and no archive left
   * to move; `list-live` when a restoration from the trash brought at least one of its lists back
   * meanwhile, so the job left the tasks it had not moved yet live in that list.
   */
  readonly outcome: 'completed' | 'list-live';

  /** The trash entries this run made, one per root. */
  readonly entries: number;

  /** The tasks this run moved to the trash, of every entry. */
  readonly tasks: number;

  /**
   * The pending access requests this run dropped: of the space while still deleted, of each list
   * while still deleted, and of the tasks it moved.
   */
  readonly requestsDropped: number;

  /** The lists whose tombstone this run erased, since no task referenced them any more. */
  readonly listsPurged: number;

  /** Whether this run erased the deleted space, left without a list. */
  readonly spacePurged: boolean;

  /**
   * The batches of tasks this run committed (`trashed`); the closing call of each list, which finds
   * nothing left or the list live, the reading of the lists of a space and the erasure of the space
   * are not counted.
   */
  readonly batches: number;
  // #endregion
}
