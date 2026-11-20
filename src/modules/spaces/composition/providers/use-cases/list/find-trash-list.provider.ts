import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { FindTrashList } from '../../../../application/use-cases/queries/list/find-trash-list/find-trash-list.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant findTrashListProvider
 *
 * @description
 * Builds the reading of the list of a trash entry, which the tasks module calls, on the tenant
 * unit of work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<FindTrashList>}
 */
export const findTrashListProvider: FactoryProvider<FindTrashList> = {
  provide: FindTrashList,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): FindTrashList => new FindTrashList(unitOfWork),
};
