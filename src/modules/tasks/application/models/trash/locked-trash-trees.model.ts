import type { TrashTree } from './trash-tree.model.js';

/**
 * Interface LockedTrashTrees
 *
 * @description
 * What `TrashTreeLocker` locked: the roots it took, in their order, and the trees of those still
 * out of the trash, each locked.
 */
export interface LockedTrashTrees {
  // #region Properties
  /** The roots it took, in the order given, those found gone or in the trash included. */
  readonly examined: readonly string[];

  /** The trees of the roots it took that are still out of the trash, in the order of the roots. */
  readonly trees: readonly TrashTree[];
  // #endregion
}
