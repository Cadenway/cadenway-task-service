import type { FactoryProvider } from '@nestjs/common';

import { PurgeMemberFavorites } from '../../../../../favorites/public/purge/purge-member-favorites.js';
import type { MemberFavorites } from '../../../../application/ports/outbound/favorites/member/member-favorites.port.js';
import { FavoritesMemberFavorites } from '../../../../infrastructure/adapters/favorites/member-favorites.adapter.js';
import { MEMBER_FAVORITES } from '../../../tokens/favorites/member-favorites.token.js';

/** Binds the member cleanup port to the favorites module. */
export const memberFavoritesProvider: FactoryProvider<MemberFavorites> = {
  provide: MEMBER_FAVORITES,
  inject: [PurgeMemberFavorites],
  useFactory: (cleanup: PurgeMemberFavorites): MemberFavorites =>
    new FavoritesMemberFavorites(cleanup),
};
