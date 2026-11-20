import type { FactoryProvider } from '@nestjs/common';

import { FindOrganizationMember } from '../../../../../organization-members/public/membership/find-organization-member.js';
import { FindFavoriteSavedView } from '../../../../../saved-views/public/view/find-favorite-saved-view.js';
import { FindVisibleList } from '../../../../../spaces/public/list/find-visible-list.js';
import { FindVisibleLists } from '../../../../../spaces/public/list/find-visible-lists.js';
import { LockTrashLists } from '../../../../../spaces/public/list/lock-trash-lists.js';
import { FindFavoriteSpaces } from '../../../../../spaces/public/space/find-favorite-spaces.js';
import type { FavoriteDirectory } from '../../../../application/ports/outbound/targets/favorite/favorite-directory.port.js';
import { ModuleFavoriteDirectory } from '../../../../infrastructure/adapters/targets/module-favorite-directory.adapter.js';
import { FAVORITE_DIRECTORY } from '../../../tokens/favorite/favorite-directory.token.js';

/** Binds the consumer's target port to public owning-module operations. */
export const favoriteDirectoryProvider: FactoryProvider<FavoriteDirectory> = {
  provide: FAVORITE_DIRECTORY,
  inject: [
    FindOrganizationMember,
    FindFavoriteSpaces,
    FindVisibleList,
    FindVisibleLists,
    LockTrashLists,
    FindFavoriteSavedView,
  ],
  useFactory: (
    membership: FindOrganizationMember,
    findSpaces: FindFavoriteSpaces,
    findList: FindVisibleList,
    findLists: FindVisibleLists,
    holdLists: LockTrashLists,
    findSavedView: FindFavoriteSavedView,
  ): FavoriteDirectory =>
    new ModuleFavoriteDirectory(
      membership,
      findSpaces,
      findList,
      findLists,
      holdLists,
      findSavedView,
    ),
};
