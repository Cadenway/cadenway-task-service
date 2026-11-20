import type { PurgeMemberFavorites } from '../../../../favorites/public/purge/purge-member-favorites.js';
import type { MemberFavorites } from '../../../application/ports/outbound/favorites/member/member-favorites.port.js';

/** Delegates member preference removal to its owning module. */
export class FavoritesMemberFavorites implements MemberFavorites {
  // #region Constructor
  /** Takes the transactional member cleanup operation. */
  public constructor(private readonly cleanup: PurgeMemberFavorites) {}
  // #endregion

  // #region Methods
  /** Removes favorites if the user has not rejoined. */
  public async purge(organizationId: string, userId: string): Promise<void> {
    await this.cleanup.execute({ organizationId, userId });
  }
  // #endregion
}
