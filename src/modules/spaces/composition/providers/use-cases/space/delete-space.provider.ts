import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { TrashWrites } from '../../../../application/ports/outbound/feature/trash/trash-writes.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { DeleteSpace } from '../../../../application/use-cases/commands/space/delete-space/delete-space.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';
import { TRASH_WRITES } from '../../../tokens/trash/trash-writes.token.js';

/**
 * Constant deleteSpaceProvider
 *
 * @description
 * Builds the deletion of a space on the tenant unit of work of the module, which also enqueues
 * its job, the member directory, which reads the role of the actor in the same transaction, and
 * the switch of the writes of the trash.
 *
 * @type {FactoryProvider<DeleteSpace>}
 */
export const deleteSpaceProvider: FactoryProvider<DeleteSpace> = {
  provide: DeleteSpace,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY, TRASH_WRITES],
  useFactory: (
    unitOfWork: SpacesUnitOfWork,
    members: MemberDirectory,
    trashWrites: TrashWrites,
  ): DeleteSpace => new DeleteSpace(unitOfWork, members, trashWrites),
};
