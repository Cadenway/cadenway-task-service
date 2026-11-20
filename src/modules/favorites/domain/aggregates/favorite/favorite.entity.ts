import type { FavoriteKind } from '../../value-objects/target/favorite-kind.value-object.js';

/** A private favorite referencing a target whose visibility can change. */
export interface Favorite {
  // #region Properties
  /** Immutable identity of the favorite. */
  readonly id: string;

  /** Resource kind of the target. */
  readonly kind: FavoriteKind;

  /** Identity of the target within the organization. */
  readonly targetId: string;

  /** Creation time used for ordering. */
  readonly createdAt: Date;

  /** Version exposed in the favorite's ETag. */
  readonly version: number;
  // #endregion
}
