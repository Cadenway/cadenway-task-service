import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { UnarchiveList } from '../../../../application/use-cases/commands/list/unarchive-list/unarchive-list.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant unarchiveListProvider
 *
 * @description
 * Builds the restoration of an archived list or sprint on the tenant unit of work of the module
 * and the member directory, which reads the role of the actor in the same transaction.
 *
 * @type {FactoryProvider<UnarchiveList>}
 */
export const unarchiveListProvider: FactoryProvider<UnarchiveList> = {
  provide: UnarchiveList,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): UnarchiveList =>
    new UnarchiveList(unitOfWork, members),
};
