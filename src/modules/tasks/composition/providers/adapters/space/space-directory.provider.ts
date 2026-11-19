import type { FactoryProvider } from '@nestjs/common';

import { FindVisibleList } from '../../../../../spaces/public/list/find-visible-list.js';
import { FindVisibleSpaceLists } from '../../../../../spaces/public/list/find-visible-space-lists.js';
import { ListCurrentSprints } from '../../../../../spaces/public/list/list-current-sprints.js';
import { ListSidebarLists } from '../../../../../spaces/public/list/list-sidebar-lists.js';
import { ListVisibleListIds } from '../../../../../spaces/public/list/list-visible-list-ids.js';
import { AllocateTaskKeys } from '../../../../../spaces/public/space/allocate-task-keys.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import { SpacesSpaceDirectory } from '../../../../infrastructure/adapters/spaces/spaces-space-directory.adapter.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';

/**
 * Constant spaceDirectoryProvider
 *
 * @description
 * Binds the `SpaceDirectory` port to the operations `SpacesModule` exports (`FindVisibleList`,
 * `ListVisibleListIds`, `FindVisibleSpaceLists`, `ListCurrentSprints`, `ListSidebarLists` and
 * `AllocateTaskKeys`), which join the tenant transaction of the calling use case.
 *
 * @type {FactoryProvider<SpaceDirectory>}
 */
export const spaceDirectoryProvider: FactoryProvider<SpaceDirectory> = {
  provide: SPACE_DIRECTORY,
  inject: [
    FindVisibleList,
    ListVisibleListIds,
    FindVisibleSpaceLists,
    ListCurrentSprints,
    ListSidebarLists,
    AllocateTaskKeys,
  ],
  useFactory: (
    findVisibleList: FindVisibleList,
    listVisibleListIds: ListVisibleListIds,
    findVisibleSpaceLists: FindVisibleSpaceLists,
    listCurrentSprints: ListCurrentSprints,
    listSidebarLists: ListSidebarLists,
    allocateTaskKeys: AllocateTaskKeys,
  ): SpaceDirectory =>
    new SpacesSpaceDirectory(
      findVisibleList,
      listVisibleListIds,
      findVisibleSpaceLists,
      listCurrentSprints,
      listSidebarLists,
      allocateTaskKeys,
    ),
};
