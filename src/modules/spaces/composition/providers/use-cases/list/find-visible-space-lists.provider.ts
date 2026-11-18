import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { FindVisibleSpaceLists } from '../../../../application/use-cases/queries/list/find-visible-space-lists/find-visible-space-lists.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant findVisibleSpaceListsProvider
 *
 * @description
 * Builds the lookup of the lists of a space the viewer sees, which the tasks module calls, on the
 * tenant unit of work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<FindVisibleSpaceLists>}
 */
export const findVisibleSpaceListsProvider: FactoryProvider<FindVisibleSpaceLists> = {
  provide: FindVisibleSpaceLists,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): FindVisibleSpaceLists =>
    new FindVisibleSpaceLists(unitOfWork),
};
