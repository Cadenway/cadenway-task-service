import { SystemTransactionRunner } from '@cadenway/nest-common/database';
import type { FactoryProvider } from '@nestjs/common';

import type { TrashSystemUnitOfWork } from '../../../../application/ports/outbound/transactions/trash/trash-system-unit-of-work.port.js';
import { SystemTrashUnitOfWork } from '../../../../infrastructure/persistence/drizzle/transactions/trash/system-trash.unit-of-work.js';
import { TRASH_SYSTEM_UNIT_OF_WORK } from '../../../tokens/trash/trash-system-unit-of-work.token.js';

/**
 * Constant trashSystemUnitOfWorkProvider
 *
 * @description
 * Binds the read-only system unit of work of the trash to the system runner of the kit, which
 * `DatabaseModule` exports.
 *
 * @type {FactoryProvider<TrashSystemUnitOfWork>}
 */
export const trashSystemUnitOfWorkProvider: FactoryProvider<TrashSystemUnitOfWork> = {
  provide: TRASH_SYSTEM_UNIT_OF_WORK,
  inject: [SystemTransactionRunner],
  useFactory: (runner: SystemTransactionRunner): TrashSystemUnitOfWork =>
    new SystemTrashUnitOfWork(runner),
};
