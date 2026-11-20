/**
 * Interface TrashWrites
 *
 * @description
 * The switch of the writes that create tombstones (`TRASH_WRITES_ENABLED`, off by default): the
 * release before this one ignores `deleted_at`, so no tombstone may exist while a rollback to it is
 * possible (`.claude/rules/migrations.md`, expand then contract). While it is off, a deletion of a
 * list or a space answers as an unknown route; every reading of the tombstones, the restoration and
 * the erasure stay served, as they act only on what exists.
 */
export interface TrashWrites {
  // #region Methods
  /**
   * Method isEnabled
   *
   * @description
   * Whether the deletions of lists and spaces are served.
   *
   * @returns {boolean} `true` when they are.
   */
  isEnabled(): boolean;
  // #endregion
}
