import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { FirstOnboardingTask } from '../../../../application/ports/outbound/onboarding/checklist/first-onboarding-task.port.js';
import { CreateTask } from '../../../../application/use-cases/commands/task/create-task/create-task.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';
import { FIRST_ONBOARDING_TASK } from '../../../tokens/onboarding/first-onboarding-task.token.js';

/**
 * Constant createTaskProvider
 *
 * @description
 * Builds the creation of a task and its subtasks in a list on the tenant unit of work of the module, the member directory, which reads the
 * role of the actor in the same transaction and the space directory, which reads the lists and hands out the keys.
 *
 * @type {FactoryProvider<CreateTask>}
 */
export const createTaskProvider: FactoryProvider<CreateTask> = {
  provide: CreateTask,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY, FIRST_ONBOARDING_TASK],
  useFactory: (
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
    onboarding: FirstOnboardingTask,
  ): CreateTask => new CreateTask(unitOfWork, members, spaces, onboarding),
};
