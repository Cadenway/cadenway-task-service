import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { UpdateList } from '../../../../application/use-cases/commands/list/update-list/update-list.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant updateListProvider
 *
 * @description
 * Builds the update of a list or sprint on the tenant unit of work of the module and the member
 * directory, which reads the role of the actor in the same transaction.
 *
 * @type {FactoryProvider<UpdateList>}
 */
export const updateListProvider: FactoryProvider<UpdateList> = {
  provide: UpdateList,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): UpdateList =>
    new UpdateList(unitOfWork, members),
};
