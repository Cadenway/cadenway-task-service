import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { GetSpace } from '../../../../application/use-cases/queries/space/get-space/get-space.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant getSpaceProvider
 *
 * @description
 * Builds the reading of one space the actor can see on the tenant unit of work of the module and
 * the member directory, which reads the role of the actor in the same transaction.
 *
 * @type {FactoryProvider<GetSpace>}
 */
export const getSpaceProvider: FactoryProvider<GetSpace> = {
  provide: GetSpace,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): GetSpace =>
    new GetSpace(unitOfWork, members),
};
