import type { FactoryProvider } from '@nestjs/common';

import type { TrashPurge } from '../../../../application/ports/outbound/tasks/trash/trash-purge.port.js';
import { PurgeTrash } from '../../../../application/use-cases/commands/trash/purge-trash/purge-trash.use-case.js';
import { TRASH_PURGE } from '../../../tokens/trash/trash-purge.token.js';

/**
 * Constant purgeTrashProvider
 *
 * @description
 * Builds the work of the purge job on the batch erasure of the trash of the tasks module, each
 * batch in a tenant transaction of its own in the organization context of the job.
 *
 * @type {FactoryProvider<PurgeTrash>}
 */
export const purgeTrashProvider: FactoryProvider<PurgeTrash> = {
  provide: PurgeTrash,
  inject: [TRASH_PURGE],
  useFactory: (trash: TrashPurge): PurgeTrash => new PurgeTrash(trash),
};
