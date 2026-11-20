import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ListTrashEntries } from '../../../../application/use-cases/queries/trash/list-trash-entries/list-trash-entries.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant listTrashEntriesProvider
 *
 * @description
 * Builds the page of the trash on the tenant unit of work of the module, the member directory, which reads the
 * role of the actor in the same transaction, and the space directory, which reads the lists.
 *
 * @type {FactoryProvider<ListTrashEntries>}
 */
export const listTrashEntriesProvider: FactoryProvider<ListTrashEntries> = {
  provide: ListTrashEntries,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ): ListTrashEntries => new ListTrashEntries(unitOfWork, members, spaces),
};
