import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { SetSpaceGrant } from '../../../../application/use-cases/commands/access/set-space-grant/set-space-grant.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant setSpaceGrantProvider
 *
 * @description
 * Builds the change of a grant of a space on the tenant unit of work of the module and the member
 * directory, which reads the roles of the actor and of the person in the same transaction.
 *
 * @type {FactoryProvider<SetSpaceGrant>}
 */
export const setSpaceGrantProvider: FactoryProvider<SetSpaceGrant> = {
  provide: SetSpaceGrant,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): SetSpaceGrant =>
    new SetSpaceGrant(unitOfWork, members),
};
