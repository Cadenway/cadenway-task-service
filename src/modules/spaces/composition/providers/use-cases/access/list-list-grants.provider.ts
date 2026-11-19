import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ListListGrants } from '../../../../application/use-cases/queries/access/list-list-grants/list-list-grants.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant listListGrantsProvider
 *
 * @description
 * Builds the listing of the grants of a list on the tenant unit of work of the module and the
 * member directory, which reads the role of the actor in the same transaction.
 *
 * @type {FactoryProvider<ListListGrants>}
 */
export const listListGrantsProvider: FactoryProvider<ListListGrants> = {
  provide: ListListGrants,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): ListListGrants =>
    new ListListGrants(unitOfWork, members),
};
