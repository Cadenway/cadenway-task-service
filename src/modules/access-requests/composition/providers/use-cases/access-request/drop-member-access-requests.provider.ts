import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { AccessRequestsUnitOfWork } from '../../../../application/ports/outbound/transactions/access-request/access-requests-unit-of-work.port.js';
import { DropMemberAccessRequests } from '../../../../application/use-cases/commands/access-request/drop-member-access-requests/drop-member-access-requests.use-case.js';
import { ACCESS_REQUESTS_UNIT_OF_WORK } from '../../../tokens/access-request/access-requests-unit-of-work.token.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';

/**
 * Constant dropMemberAccessRequestsProvider
 *
 * @description
 * Builds one batch of the dropping of the pending requests of a removed member, which the clean-up
 * job of member-lifecycle runs, on the tenant unit of work of the module, one transaction per
 * batch, and the member directory, which reads the copy of the memberships in that transaction.
 *
 * @type {FactoryProvider<DropMemberAccessRequests>}
 */
export const dropMemberAccessRequestsProvider: FactoryProvider<DropMemberAccessRequests> = {
  provide: DropMemberAccessRequests,
  inject: [ACCESS_REQUESTS_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (
    unitOfWork: AccessRequestsUnitOfWork,
    members: MemberDirectory,
  ): DropMemberAccessRequests => new DropMemberAccessRequests(unitOfWork, members),
};
