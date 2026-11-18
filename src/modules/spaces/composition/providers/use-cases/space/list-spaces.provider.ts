import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ListSpaces } from '../../../../application/use-cases/queries/space/list-spaces/list-spaces.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant listSpacesProvider
 *
 * @description
 * Builds the page of the spaces the actor can see on the tenant unit of work of the module and the
 * member directory, which reads the role of the actor in the same transaction.
 *
 * @type {FactoryProvider<ListSpaces>}
 */
export const listSpacesProvider: FactoryProvider<ListSpaces> = {
  provide: ListSpaces,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): ListSpaces =>
    new ListSpaces(unitOfWork, members),
};
