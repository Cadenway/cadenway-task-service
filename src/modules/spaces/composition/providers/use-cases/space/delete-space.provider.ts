import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { DeleteSpace } from '../../../../application/use-cases/commands/space/delete-space/delete-space.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant deleteSpaceProvider
 *
 * @description
 * Builds the deletion of a space on the tenant unit of work of the module, which also enqueues
 * its job, and the member directory, which reads the role of the actor in the same transaction.
 *
 * @type {FactoryProvider<DeleteSpace>}
 */
export const deleteSpaceProvider: FactoryProvider<DeleteSpace> = {
  provide: DeleteSpace,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): DeleteSpace =>
    new DeleteSpace(unitOfWork, members),
};
