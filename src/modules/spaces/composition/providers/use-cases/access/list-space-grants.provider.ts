import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ListSpaceGrants } from '../../../../application/use-cases/queries/access/list-space-grants/list-space-grants.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant listSpaceGrantsProvider
 *
 * @description
 * Builds the listing of the grants of a space on the tenant unit of work of the module and the
 * member directory, which reads the role of the actor in the same transaction.
 *
 * @type {FactoryProvider<ListSpaceGrants>}
 */
export const listSpaceGrantsProvider: FactoryProvider<ListSpaceGrants> = {
  provide: ListSpaceGrants,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): ListSpaceGrants =>
    new ListSpaceGrants(unitOfWork, members),
};
