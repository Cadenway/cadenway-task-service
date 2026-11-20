import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { LockDeletedList } from '../../../../application/use-cases/commands/list/lock-deleted-list/lock-deleted-list.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant lockDeletedListProvider
 *
 * @description
 * Builds the lock of a deleted list before a restoration or an erasure of a trash entry of it,
 * which the tasks module calls, on the tenant unit of work of the module: it joins the transaction
 * of the caller.
 *
 * @type {FactoryProvider<LockDeletedList>}
 */
export const lockDeletedListProvider: FactoryProvider<LockDeletedList> = {
  provide: LockDeletedList,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): LockDeletedList => new LockDeletedList(unitOfWork),
};
