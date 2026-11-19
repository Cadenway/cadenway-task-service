import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { GrantRequestedAccess } from '../../../../application/use-cases/commands/access/grant-requested-access/grant-requested-access.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant grantRequestedAccessProvider
 *
 * @description
 * Builds the grant of an approved access request, which the access-requests module calls, on the
 * tenant unit of work of the module, which joins the transaction of the caller, and the member
 * directory, which reads the role of the requester.
 *
 * @type {FactoryProvider<GrantRequestedAccess>}
 */
export const grantRequestedAccessProvider: FactoryProvider<GrantRequestedAccess> = {
  provide: GrantRequestedAccess,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): GrantRequestedAccess =>
    new GrantRequestedAccess(unitOfWork, members),
};
