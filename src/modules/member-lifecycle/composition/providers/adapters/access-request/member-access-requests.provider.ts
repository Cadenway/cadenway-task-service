import type { FactoryProvider } from '@nestjs/common';

import { DropMemberAccessRequests } from '../../../../../access-requests/public/access-request/drop-member-access-requests.js';
import type { MemberAccessRequests } from '../../../../application/ports/outbound/access-requests/access-request/member-access-requests.port.js';
import { AccessRequestsMemberAccessRequests } from '../../../../infrastructure/adapters/access-requests/member-access-requests.adapter.js';
import { MEMBER_ACCESS_REQUESTS } from '../../../tokens/access-request/member-access-requests.token.js';

/**
 * Constant memberAccessRequestsProvider
 *
 * @description
 * Binds the `MemberAccessRequests` port to the public operation `DropMemberAccessRequests` that
 * `AccessRequestsModule` exports.
 *
 * @type {FactoryProvider<MemberAccessRequests>}
 */
export const memberAccessRequestsProvider: FactoryProvider<MemberAccessRequests> = {
  provide: MEMBER_ACCESS_REQUESTS,
  inject: [DropMemberAccessRequests],
  useFactory: (dropMemberAccessRequests: DropMemberAccessRequests): MemberAccessRequests =>
    new AccessRequestsMemberAccessRequests(dropMemberAccessRequests),
};
