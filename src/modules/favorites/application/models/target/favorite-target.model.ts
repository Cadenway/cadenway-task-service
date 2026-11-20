import type { FavoriteKind } from '../../../domain/value-objects/target/favorite-kind.value-object.js';

/** Link identity stored without any target display data. */
export interface FavoriteTarget {
  // #region Properties
  /** Resource kind of the target. */
  readonly kind: FavoriteKind;

  /** Identity of the target. */
  readonly targetId: string;
  // #endregion
}
