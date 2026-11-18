import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ListListTasks } from '../../../../application/use-cases/queries/list/list-list-tasks/list-list-tasks.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant listListTasksProvider
 *
 * @description
 * Builds the reading of the page of the tasks of a list, filtered and sorted on the tenant unit of work of the module, the member directory, which reads the
 * role of the actor in the same transaction and the space directory, which reads the lists and the spaces.
 *
 * @type {FactoryProvider<ListListTasks>}
 */
export const listListTasksProvider: FactoryProvider<ListListTasks> = {
  provide: ListListTasks,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ): ListListTasks => new ListListTasks(unitOfWork, members, spaces),
};
