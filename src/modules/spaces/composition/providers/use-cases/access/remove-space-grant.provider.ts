import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { RemoveSpaceGrant } from '../../../../application/use-cases/commands/access/remove-space-grant/remove-space-grant.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant removeSpaceGrantProvider
 *
 * @description
 * Builds the removal of a grant of a space on the tenant unit of work of the module and the member
 * directory, which reads the role of the actor in the same transaction.
 *
 * @type {FactoryProvider<RemoveSpaceGrant>}
 */
export const removeSpaceGrantProvider: FactoryProvider<RemoveSpaceGrant> = {
  provide: RemoveSpaceGrant,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): RemoveSpaceGrant =>
    new RemoveSpaceGrant(unitOfWork, members),
};
