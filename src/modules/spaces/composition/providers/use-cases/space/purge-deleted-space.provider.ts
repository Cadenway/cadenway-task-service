import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { PurgeDeletedSpace } from '../../../../application/use-cases/commands/space/purge-deleted-space/purge-deleted-space.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant purgeDeletedSpaceProvider
 *
 * @description
 * Builds the erasure of a deleted space left without a list, which the deletion-lifecycle module
 * calls, on the tenant unit of work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<PurgeDeletedSpace>}
 */
export const purgeDeletedSpaceProvider: FactoryProvider<PurgeDeletedSpace> = {
  provide: PurgeDeletedSpace,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): PurgeDeletedSpace =>
    new PurgeDeletedSpace(unitOfWork),
};
