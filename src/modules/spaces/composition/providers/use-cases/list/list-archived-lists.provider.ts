import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ListArchivedLists } from '../../../../application/use-cases/queries/list/list-archived-lists/list-archived-lists.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant listArchivedListsProvider
 *
 * @description
 * Builds the page of the archived lists a viewer has a role on, which the tasks module calls, on
 * the tenant unit of work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<ListArchivedLists>}
 */
export const listArchivedListsProvider: FactoryProvider<ListArchivedLists> = {
  provide: ListArchivedLists,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): ListArchivedLists =>
    new ListArchivedLists(unitOfWork),
};
