import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ListDeletedSpaceLists } from '../../../../application/use-cases/commands/list/list-deleted-space-lists/list-deleted-space-lists.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant listDeletedSpaceListsProvider
 *
 * @description
 * Builds the reading of the deleted lists of a deleted space, which the deletion-lifecycle module
 * calls, on the tenant unit of work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<ListDeletedSpaceLists>}
 */
export const listDeletedSpaceListsProvider: FactoryProvider<ListDeletedSpaceLists> = {
  provide: ListDeletedSpaceLists,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): ListDeletedSpaceLists =>
    new ListDeletedSpaceLists(unitOfWork),
};
