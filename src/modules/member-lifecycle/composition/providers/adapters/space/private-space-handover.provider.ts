import type { FactoryProvider } from '@nestjs/common';

import { HandOverPrivateSpaces } from '../../../../../spaces/public/space/hand-over-private-spaces.js';
import type { PrivateSpaceHandover } from '../../../../application/ports/outbound/spaces/space/private-space-handover.port.js';
import { SpacesPrivateSpaceHandover } from '../../../../infrastructure/adapters/spaces/private-space-handover.adapter.js';
import { PRIVATE_SPACE_HANDOVER } from '../../../tokens/space/private-space-handover.token.js';

/**
 * Constant privateSpaceHandoverProvider
 *
 * @description
 * Binds the `PrivateSpaceHandover` port to `HandOverPrivateSpaces`, which `SpacesModule` exports.
 *
 * @type {FactoryProvider<PrivateSpaceHandover>}
 */
export const privateSpaceHandoverProvider: FactoryProvider<PrivateSpaceHandover> = {
  provide: PRIVATE_SPACE_HANDOVER,
  inject: [HandOverPrivateSpaces],
  useFactory: (handOverPrivateSpaces: HandOverPrivateSpaces): PrivateSpaceHandover =>
    new SpacesPrivateSpaceHandover(handOverPrivateSpaces),
};
