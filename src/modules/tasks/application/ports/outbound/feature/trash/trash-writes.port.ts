/**
 * Interface TrashWrites
 *
 * @description
 * The switch of the writes that put something in the trash (`TRASH_WRITES_ENABLED`, off by
 * default). The release before 0007 ignores `trash_entry_id`: while a rollback to it is possible,
 * no trash entry may exist, so "Supprimer la tâche" and "Vider la corbeille" check this switch
 * first and answer, while it is off, as that release does for a route it does not have. The
 * restoration and the erasure of an entry, the page of the trash and the batches of the jobs are
 * always served: they only act on what is already there.
 */
export interface TrashWrites {
  // #region Methods
  /**
   * Method isEnabled
   *
   * @description
   * Whether the writes that create trash entries are served.
   *
   * @returns {boolean} `true` once the switch is on.
   */
  isEnabled(): boolean;
  // #endregion
}
