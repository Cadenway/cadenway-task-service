import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { LockDeletedLists } from '../../../../application/use-cases/commands/list/lock-deleted-lists/lock-deleted-lists.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant lockDeletedListsProvider
 *
 * @description
 * Builds the lock of several deleted lists before an erasure of trash entries of them, which the
 * tasks module calls, on the tenant unit of work of the module: it joins the transaction of the
 * caller.
 *
 * @type {FactoryProvider<LockDeletedLists>}
 */
export const lockDeletedListsProvider: FactoryProvider<LockDeletedLists> = {
  provide: LockDeletedLists,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): LockDeletedLists => new LockDeletedLists(unitOfWork),
};
