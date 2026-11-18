import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { CreateSpace } from '../../../../application/use-cases/commands/space/create-space/create-space.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant createSpaceProvider
 *
 * @description
 * Builds the creation of a space, with its statuses, its prefix and its first list, on the tenant
 * unit of work of the module and the member directory, which reads the role of the actor in the
 * same transaction.
 *
 * @type {FactoryProvider<CreateSpace>}
 */
export const createSpaceProvider: FactoryProvider<CreateSpace> = {
  provide: CreateSpace,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): CreateSpace =>
    new CreateSpace(unitOfWork, members),
};
