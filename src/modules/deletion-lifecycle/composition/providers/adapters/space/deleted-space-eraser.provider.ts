import type { FactoryProvider } from '@nestjs/common';

import { PurgeDeletedSpace } from '../../../../../spaces/public/space/purge-deleted-space.js';
import type { DeletedSpaceEraser } from '../../../../application/ports/outbound/spaces/space/deleted-space-eraser.port.js';
import { SpacesDeletedSpaceEraser } from '../../../../infrastructure/adapters/spaces/deleted-space-eraser.adapter.js';
import { DELETED_SPACE_ERASER } from '../../../tokens/space/deleted-space-eraser.token.js';

/**
 * Constant deletedSpaceEraserProvider
 *
 * @description
 * Binds the `DeletedSpaceEraser` port to the public operation `PurgeDeletedSpace` that
 * `SpacesModule` exports.
 *
 * @type {FactoryProvider<DeletedSpaceEraser>}
 */
export const deletedSpaceEraserProvider: FactoryProvider<DeletedSpaceEraser> = {
  provide: DELETED_SPACE_ERASER,
  inject: [PurgeDeletedSpace],
  useFactory: (purgeDeletedSpace: PurgeDeletedSpace): DeletedSpaceEraser =>
    new SpacesDeletedSpaceEraser(purgeDeletedSpace),
};
