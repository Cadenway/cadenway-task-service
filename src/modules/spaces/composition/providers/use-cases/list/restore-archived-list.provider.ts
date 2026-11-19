import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { RestoreArchivedList } from '../../../../application/use-cases/commands/list/restore-archived-list/restore-archived-list.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant restoreArchivedListProvider
 *
 * @description
 * Builds the restoration of the archived list of a restored task, which the tasks module calls,
 * on the tenant unit of work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<RestoreArchivedList>}
 */
export const restoreArchivedListProvider: FactoryProvider<RestoreArchivedList> = {
  provide: RestoreArchivedList,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): RestoreArchivedList =>
    new RestoreArchivedList(unitOfWork),
};
