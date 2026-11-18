import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ListSidebarLists } from '../../../../application/use-cases/queries/list/list-sidebar-lists/list-sidebar-lists.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant listSidebarListsProvider
 *
 * @description
 * Builds the listing of the first lists of the sidebar of the viewer, which the tasks module calls,
 * on the tenant unit of work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<ListSidebarLists>}
 */
export const listSidebarListsProvider: FactoryProvider<ListSidebarLists> = {
  provide: ListSidebarLists,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): ListSidebarLists => new ListSidebarLists(unitOfWork),
};
