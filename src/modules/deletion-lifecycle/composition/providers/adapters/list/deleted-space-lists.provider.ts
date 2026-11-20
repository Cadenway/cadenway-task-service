import type { FactoryProvider } from '@nestjs/common';

import { ListDeletedSpaceLists } from '../../../../../spaces/public/list/list-deleted-space-lists.js';
import type { DeletedSpaceLists } from '../../../../application/ports/outbound/spaces/list/deleted-space-lists.port.js';
import { SpacesDeletedSpaceLists } from '../../../../infrastructure/adapters/spaces/deleted-space-lists.adapter.js';
import { DELETED_SPACE_LISTS } from '../../../tokens/list/deleted-space-lists.token.js';

/**
 * Constant deletedSpaceListsProvider
 *
 * @description
 * Binds the `DeletedSpaceLists` port to the public operation `ListDeletedSpaceLists` that
 * `SpacesModule` exports.
 *
 * @type {FactoryProvider<DeletedSpaceLists>}
 */
export const deletedSpaceListsProvider: FactoryProvider<DeletedSpaceLists> = {
  provide: DELETED_SPACE_LISTS,
  inject: [ListDeletedSpaceLists],
  useFactory: (listDeletedSpaceLists: ListDeletedSpaceLists): DeletedSpaceLists =>
    new SpacesDeletedSpaceLists(listDeletedSpaceLists),
};
