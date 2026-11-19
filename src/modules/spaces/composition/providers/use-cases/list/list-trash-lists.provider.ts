import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ListTrashLists } from '../../../../application/use-cases/queries/list/list-trash-lists/list-trash-lists.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant listTrashListsProvider
 *
 * @description
 * Builds the reading of the lists of the trash of a member, which the tasks module calls, on the
 * tenant unit of work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<ListTrashLists>}
 */
export const listTrashListsProvider: FactoryProvider<ListTrashLists> = {
  provide: ListTrashLists,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): ListTrashLists => new ListTrashLists(unitOfWork),
};
