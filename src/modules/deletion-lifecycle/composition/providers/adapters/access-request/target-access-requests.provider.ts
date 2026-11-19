import type { FactoryProvider } from '@nestjs/common';

import { DropTargetAccessRequests } from '../../../../../access-requests/public/access-request/drop-target-access-requests.js';
import type { TargetAccessRequests } from '../../../../application/ports/outbound/access-requests/access-request/target-access-requests.port.js';
import { AccessRequestsTargetAccessRequests } from '../../../../infrastructure/adapters/access-requests/target-access-requests.adapter.js';
import { TARGET_ACCESS_REQUESTS } from '../../../tokens/access-request/target-access-requests.token.js';

/**
 * Constant targetAccessRequestsProvider
 *
 * @description
 * Binds the `TargetAccessRequests` port to the public operation `DropTargetAccessRequests` that
 * `AccessRequestsModule` exports.
 *
 * @type {FactoryProvider<TargetAccessRequests>}
 */
export const targetAccessRequestsProvider: FactoryProvider<TargetAccessRequests> = {
  provide: TARGET_ACCESS_REQUESTS,
  inject: [DropTargetAccessRequests],
  useFactory: (dropTargetAccessRequests: DropTargetAccessRequests): TargetAccessRequests =>
    new AccessRequestsTargetAccessRequests(dropTargetAccessRequests),
};
