import type { FactoryProvider } from '@nestjs/common';
import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ResolveCommentTask } from '../../../../application/use-cases/queries/task/resolve-comment-task/resolve-comment-task.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Binds comment task resolution to the same tenant and directories as task detail. */
export const resolveCommentTaskProvider: FactoryProvider<ResolveCommentTask> = {
  provide: ResolveCommentTask,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (
    unit: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ): ResolveCommentTask => new ResolveCommentTask(unit, members, spaces),
};
