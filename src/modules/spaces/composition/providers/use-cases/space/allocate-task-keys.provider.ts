import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AllocateTaskKeys } from '../../../../application/use-cases/commands/space/allocate-task-keys/allocate-task-keys.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant allocateTaskKeysProvider
 *
 * @description
 * Builds the allocation of task numbers, which the tasks module calls in its creation transaction,
 * on the tenant unit of work of the module: it joins that transaction, so that the numbers and the
 * tasks that use them commit or roll back together.
 *
 * @type {FactoryProvider<AllocateTaskKeys>}
 */
export const allocateTaskKeysProvider: FactoryProvider<AllocateTaskKeys> = {
  provide: AllocateTaskKeys,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): AllocateTaskKeys => new AllocateTaskKeys(unitOfWork),
};
