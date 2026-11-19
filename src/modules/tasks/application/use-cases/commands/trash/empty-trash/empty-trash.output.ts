/**
 * Interface EmptyTrashOutput
 *
 * @description
 * What "Vider la corbeille" took out of the trash (`TrashEmptied`: "12 éléments effacés
 * définitivement.").
 */
export interface EmptyTrashOutput {
  // #region Properties
  /** The entries that left the trash, to be erased for good by the purge job. */
  readonly entryCount: number;
  // #endregion
}
