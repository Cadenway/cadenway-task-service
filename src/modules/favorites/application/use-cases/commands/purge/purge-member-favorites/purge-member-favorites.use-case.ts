import type { FavoritesUnitOfWork } from '../../../../ports/outbound/persistence/favorite/favorites-unit-of-work.port.js';
import type { FavoriteDirectory } from '../../../../ports/outbound/targets/favorite/favorite-directory.port.js';
import type { PurgeMemberFavoritesInput } from './purge-member-favorites.input.js';

/** Removes preferences of a departed member as part of membership lifecycle cleanup. */
export class PurgeMemberFavorites {
  // #region Constructor
  /** Takes the tenant transaction and membership projection ports. */
  public constructor(
    private readonly unitOfWork: FavoritesUnitOfWork,
    private readonly directory: Pick<FavoriteDirectory, 'member'>,
  ) {}
  // #endregion

  // #region Methods
  /** Skips cleanup when a later membership has already restored the actor's access. */
  public async execute(input: PurgeMemberFavoritesInput): Promise<void> {
    await this.unitOfWork.write(async (favorites): Promise<void> => {
      const owner = { organizationId: input.organizationId, actorUserId: input.userId };
      // Serialize with creation even when the membership lookup has no active row to lock.
      await favorites.lockOwner(owner);
      if ((await this.directory.member(owner, true)) === null) {
        await favorites.purgeOwner(owner);
      }
    });
  }
  // #endregion
}
