import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { FindVisibleLists } from '../../../../application/use-cases/queries/list/find-visible-lists/find-visible-lists.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant findVisibleListsProvider
 *
 * @description
 * Builds the lookup of some lists a viewer has a role on, which the tasks module calls, on the
 * tenant unit of work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<FindVisibleLists>}
 */
export const findVisibleListsProvider: FactoryProvider<FindVisibleLists> = {
  provide: FindVisibleLists,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): FindVisibleLists => new FindVisibleLists(unitOfWork),
};
