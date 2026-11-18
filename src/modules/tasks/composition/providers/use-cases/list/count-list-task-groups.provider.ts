import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { CountListTaskGroups } from '../../../../application/use-cases/queries/list/count-list-task-groups/count-list-task-groups.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant countListTaskGroupsProvider
 *
 * @description
 * Builds the reading of the count of the tasks of a list by status, priority or assignee on the tenant unit of work of the module, the member directory, which reads the
 * role of the actor in the same transaction and the space directory, which reads the lists and the spaces.
 *
 * @type {FactoryProvider<CountListTaskGroups>}
 */
export const countListTaskGroupsProvider: FactoryProvider<CountListTaskGroups> = {
  provide: CountListTaskGroups,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ): CountListTaskGroups => new CountListTaskGroups(unitOfWork, members, spaces),
};
