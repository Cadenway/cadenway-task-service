import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { UpdateSpace } from '../../../../application/use-cases/commands/space/update-space/update-space.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant updateSpaceProvider
 *
 * @description
 * Builds the update of a space, its look, visibility and statuses, on the tenant unit of work of
 * the module and the member directory, which reads the role of the actor in the same transaction.
 *
 * @type {FactoryProvider<UpdateSpace>}
 */
export const updateSpaceProvider: FactoryProvider<UpdateSpace> = {
  provide: UpdateSpace,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): UpdateSpace =>
    new UpdateSpace(unitOfWork, members),
};
