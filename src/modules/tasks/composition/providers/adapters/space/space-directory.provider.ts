import type { FactoryProvider } from '@nestjs/common';

import { FindVisibleList } from '../../../../../spaces/public/list/find-visible-list.js';
import { AllocateTaskKeys } from '../../../../../spaces/public/space/allocate-task-keys.js';
import { ListVisibleSpaceIds } from '../../../../../spaces/public/space/list-visible-space-ids.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import { SpacesSpaceDirectory } from '../../../../infrastructure/adapters/spaces/spaces-space-directory.adapter.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';

/**
 * Constant spaceDirectoryProvider
 *
 * @description
 * Binds the `SpaceDirectory` port to the operations `SpacesModule` exports (`FindVisibleList`,
 * `ListVisibleSpaceIds` and `AllocateTaskKeys`), which join the tenant transaction of the calling
 * use case.
 *
 * @type {FactoryProvider<SpaceDirectory>}
 */
export const spaceDirectoryProvider: FactoryProvider<SpaceDirectory> = {
  provide: SPACE_DIRECTORY,
  inject: [FindVisibleList, ListVisibleSpaceIds, AllocateTaskKeys],
  useFactory: (
    findVisibleList: FindVisibleList,
    listVisibleSpaceIds: ListVisibleSpaceIds,
    allocateTaskKeys: AllocateTaskKeys,
  ): SpaceDirectory =>
    new SpacesSpaceDirectory(findVisibleList, listVisibleSpaceIds, allocateTaskKeys),
};
