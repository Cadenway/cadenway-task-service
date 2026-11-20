import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ResolveIntakeContactTask } from '../../../../application/use-cases/queries/intake/resolve-intake-contact-task/resolve-intake-contact-task.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Resolves private intake contacts through the ordinary task editor authorization. */
export const resolveIntakeContactTaskProvider: FactoryProvider<ResolveIntakeContactTask> = {
  provide: ResolveIntakeContactTask,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (work: TasksUnitOfWork, members: MemberDirectory, spaces: SpaceDirectory) =>
    new ResolveIntakeContactTask(work, members, spaces),
};
