import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { LockTrashLists } from '../../../../application/use-cases/commands/list/lock-trash-lists/lock-trash-lists.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant lockTrashListsProvider
 *
 * @description
 * Builds the lock of the lists of trash entries before a hand-over or an erasure of them, which
 * the tasks module calls, on the tenant unit of work of the module: it joins the transaction of the
 * caller.
 *
 * @type {FactoryProvider<LockTrashLists>}
 */
export const lockTrashListsProvider: FactoryProvider<LockTrashLists> = {
  provide: LockTrashLists,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): LockTrashLists => new LockTrashLists(unitOfWork),
};
