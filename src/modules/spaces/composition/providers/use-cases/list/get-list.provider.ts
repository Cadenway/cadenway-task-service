import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { GetList } from '../../../../application/use-cases/queries/list/get-list/get-list.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant getListProvider
 *
 * @description
 * Builds the reading of one list the actor can see on the tenant unit of work of the module and the
 * member directory, which reads the role of the actor in the same transaction.
 *
 * @type {FactoryProvider<GetList>}
 */
export const getListProvider: FactoryProvider<GetList> = {
  provide: GetList,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): GetList =>
    new GetList(unitOfWork, members),
};
