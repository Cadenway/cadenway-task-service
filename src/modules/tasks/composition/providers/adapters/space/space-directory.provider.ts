import type { FactoryProvider } from '@nestjs/common';

import { FindTrashList } from '../../../../../spaces/public/list/find-trash-list.js';
import { FindVisibleList } from '../../../../../spaces/public/list/find-visible-list.js';
import { FindVisibleLists } from '../../../../../spaces/public/list/find-visible-lists.js';
import { FindVisibleSpaceLists } from '../../../../../spaces/public/list/find-visible-space-lists.js';
import { HoldList } from '../../../../../spaces/public/list/hold-list.js';
import { LockDeletedList } from '../../../../../spaces/public/list/lock-deleted-list.js';
import { LockTrashLists } from '../../../../../spaces/public/list/lock-trash-lists.js';
import { ListArchivedLists } from '../../../../../spaces/public/list/list-archived-lists.js';
import { ListCurrentSprints } from '../../../../../spaces/public/list/list-current-sprints.js';
import { ListSidebarLists } from '../../../../../spaces/public/list/list-sidebar-lists.js';
import { ListTrashLists } from '../../../../../spaces/public/list/list-trash-lists.js';
import { ListVisibleListIds } from '../../../../../spaces/public/list/list-visible-list-ids.js';
import { PurgeDeletedList } from '../../../../../spaces/public/list/purge-deleted-list.js';
import { RestoreArchivedList } from '../../../../../spaces/public/list/restore-archived-list.js';
import { RestoreDeletedList } from '../../../../../spaces/public/list/restore-deleted-list.js';
import { AllocateTaskKeys } from '../../../../../spaces/public/space/allocate-task-keys.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import { SpacesSpaceDirectory } from '../../../../infrastructure/adapters/spaces/spaces-space-directory.adapter.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';

/**
 * Constant spaceDirectoryProvider
 *
 * @description
 * Binds the `SpaceDirectory` port to the operations `SpacesModule` exports (`FindVisibleList`,
 * `ListVisibleListIds`, `FindVisibleSpaceLists`, `ListCurrentSprints`, `ListSidebarLists`,
 * `AllocateTaskKeys`, `RestoreArchivedList`, `ListArchivedLists`, `FindVisibleLists`, and the seven
 * of the trash: `ListTrashLists`, `FindTrashList`, `RestoreDeletedList`, `PurgeDeletedList`,
 * `HoldList`, `LockDeletedList` and `LockTrashLists`), which join the tenant transaction of the
 * calling use case.
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
    RestoreArchivedList,
    ListArchivedLists,
    FindVisibleLists,
    ListTrashLists,
    FindTrashList,
    RestoreDeletedList,
    PurgeDeletedList,
    HoldList,
    LockDeletedList,
    LockTrashLists,
  ],
  useFactory: (
    findVisibleList: FindVisibleList,
    listVisibleListIds: ListVisibleListIds,
    findVisibleSpaceLists: FindVisibleSpaceLists,
    listCurrentSprints: ListCurrentSprints,
    listSidebarLists: ListSidebarLists,
    allocateTaskKeys: AllocateTaskKeys,
    restoreArchivedList: RestoreArchivedList,
    listArchivedLists: ListArchivedLists,
    findVisibleLists: FindVisibleLists,
    listTrashLists: ListTrashLists,
    findTrashList: FindTrashList,
    restoreDeletedList: RestoreDeletedList,
    purgeDeletedList: PurgeDeletedList,
    holdList: HoldList,
    lockDeletedList: LockDeletedList,
    lockTrashLists: LockTrashLists,
  ): SpaceDirectory =>
    new SpacesSpaceDirectory(
      findVisibleList,
      listVisibleListIds,
      findVisibleSpaceLists,
      listCurrentSprints,
      listSidebarLists,
      allocateTaskKeys,
      restoreArchivedList,
      listArchivedLists,
      findVisibleLists,
      listTrashLists,
      findTrashList,
      restoreDeletedList,
      purgeDeletedList,
      holdList,
      lockDeletedList,
      lockTrashLists,
    ),
};
