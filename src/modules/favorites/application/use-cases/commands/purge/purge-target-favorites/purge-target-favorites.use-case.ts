import type { FavoritesUnitOfWork } from '../../../../ports/outbound/persistence/favorite/favorites-unit-of-work.port.js';
import type { PurgeTargetFavoritesInput } from './purge-target-favorites.input.js';

/** Removes favorites held by any owner for targets undergoing permanent removal. */
export class PurgeTargetFavorites {
  // #region Constructor
  /** Takes the unit of work that joins the target owner's transaction. */
  public constructor(private readonly unitOfWork: FavoritesUnitOfWork) {}
  // #endregion

  // #region Methods
  /** The caller holds the removed targets and calls this operation in the same transaction. */
  public async execute(input: PurgeTargetFavoritesInput): Promise<void> {
    if (input.targetIds.length === 0) {
      return;
    }
    await this.unitOfWork.write((favorites): Promise<void> =>
      favorites.purgeTargets(input.organizationId, input.kind, input.targetIds),
    );
  }
  // #endregion
}
