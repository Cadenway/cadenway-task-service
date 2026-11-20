import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { RestoreDeletedList } from '../../../../application/use-cases/commands/list/restore-deleted-list/restore-deleted-list.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant restoreDeletedListProvider
 *
 * @description
 * Builds the restoration of the deleted list and space of a restored trash entry, which the tasks
 * module calls, on the tenant unit of work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<RestoreDeletedList>}
 */
export const restoreDeletedListProvider: FactoryProvider<RestoreDeletedList> = {
  provide: RestoreDeletedList,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): RestoreDeletedList =>
    new RestoreDeletedList(unitOfWork),
};
