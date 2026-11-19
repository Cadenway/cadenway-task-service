import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { RemoveMemberGrants } from '../../../../application/use-cases/commands/access/remove-member-grants/remove-member-grants.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant removeMemberGrantsProvider
 *
 * @description
 * Builds one batch of the removal of the grants of a former member, which the clean-up job of
 * member-lifecycle calls, on the tenant unit of work of the module and the member directory, which
 * reads the copy after the locks.
 *
 * @type {FactoryProvider<RemoveMemberGrants>}
 */
export const removeMemberGrantsProvider: FactoryProvider<RemoveMemberGrants> = {
  provide: RemoveMemberGrants,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): RemoveMemberGrants =>
    new RemoveMemberGrants(unitOfWork, members),
};
