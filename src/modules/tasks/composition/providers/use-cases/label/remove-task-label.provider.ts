import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { RemoveTaskLabel } from '../../../../application/use-cases/commands/label/remove-task-label/remove-task-label.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant removeTaskLabelProvider
 *
 * @description
 * Builds the removal of a label from a task on the tenant unit of work of the module, the member directory, which reads the
 * role of the actor in the same transaction and the space directory, which reads the lists and hands out the keys.
 *
 * @type {FactoryProvider<RemoveTaskLabel>}
 */
export const removeTaskLabelProvider: FactoryProvider<RemoveTaskLabel> = {
  provide: RemoveTaskLabel,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ): RemoveTaskLabel => new RemoveTaskLabel(unitOfWork, members, spaces),
};
