import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { RemoveListGrant } from '../../../../application/use-cases/commands/access/remove-list-grant/remove-list-grant.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant removeListGrantProvider
 *
 * @description
 * Builds the removal of a grant of a list on the tenant unit of work of the module and the member
 * directory, which reads the role of the actor in the same transaction.
 *
 * @type {FactoryProvider<RemoveListGrant>}
 */
export const removeListGrantProvider: FactoryProvider<RemoveListGrant> = {
  provide: RemoveListGrant,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): RemoveListGrant =>
    new RemoveListGrant(unitOfWork, members),
};
