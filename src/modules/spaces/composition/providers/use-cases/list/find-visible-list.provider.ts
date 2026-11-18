import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { FindVisibleList } from '../../../../application/use-cases/queries/list/find-visible-list/find-visible-list.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant findVisibleListProvider
 *
 * @description
 * Builds the lookup of a list the viewer sees, which the tasks module calls, on the tenant unit of
 * work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<FindVisibleList>}
 */
export const findVisibleListProvider: FactoryProvider<FindVisibleList> = {
  provide: FindVisibleList,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): FindVisibleList => new FindVisibleList(unitOfWork),
};
