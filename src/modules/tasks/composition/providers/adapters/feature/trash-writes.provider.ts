import { CONFIG } from '@cadenway/nest-common';
import type { FactoryProvider } from '@nestjs/common';

import type { AppConfig } from '../../../../../../config/app-config.js';
import type { TrashWrites } from '../../../../application/ports/outbound/feature/trash/trash-writes.port.js';
import { ConfigTrashWrites } from '../../../../infrastructure/adapters/config/config-trash-writes.adapter.js';
import { TRASH_WRITES } from '../../../tokens/feature/trash-writes.token.js';

/**
 * Constant trashWritesProvider
 *
 * @description
 * Binds the `TrashWrites` port to `TRASH_WRITES_ENABLED` of the validated configuration of the
 * service (`CONFIG` of `@cadenway/nest-common`).
 *
 * @type {FactoryProvider<TrashWrites>}
 */
export const trashWritesProvider: FactoryProvider<TrashWrites> = {
  provide: TRASH_WRITES,
  inject: [CONFIG],
  useFactory: (config: AppConfig): TrashWrites =>
    new ConfigTrashWrites(config.TRASH_WRITES_ENABLED),
};
