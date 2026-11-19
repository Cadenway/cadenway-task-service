import type { FactoryProvider } from '@nestjs/common';

import { PurgeTrashBatch } from '../../../../../tasks/public/trash/purge-trash-batch.js';
import type { TrashPurge } from '../../../../application/ports/outbound/tasks/trash/trash-purge.port.js';
import { TasksTrashPurge } from '../../../../infrastructure/adapters/tasks/trash-purge.adapter.js';
import { TRASH_PURGE } from '../../../tokens/trash/trash-purge.token.js';

/**
 * Constant trashPurgeProvider
 *
 * @description
 * Binds the `TrashPurge` port to the public operation `PurgeTrashBatch` that `TasksModule`
 * exports.
 *
 * @type {FactoryProvider<TrashPurge>}
 */
export const trashPurgeProvider: FactoryProvider<TrashPurge> = {
  provide: TRASH_PURGE,
  inject: [PurgeTrashBatch],
  useFactory: (purgeTrashBatch: PurgeTrashBatch): TrashPurge =>
    new TasksTrashPurge(purgeTrashBatch),
};
