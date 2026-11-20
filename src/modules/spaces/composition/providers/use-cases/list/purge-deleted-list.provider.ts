import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { PurgeDeletedList } from '../../../../application/use-cases/commands/list/purge-deleted-list/purge-deleted-list.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant purgeDeletedListProvider
 *
 * @description
 * Builds the erasure of a deleted list left without a task, which the tasks module calls, on the
 * tenant unit of work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<PurgeDeletedList>}
 */
export const purgeDeletedListProvider: FactoryProvider<PurgeDeletedList> = {
  provide: PurgeDeletedList,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): PurgeDeletedList => new PurgeDeletedList(unitOfWork),
};
