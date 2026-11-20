import type { FactoryProvider } from '@nestjs/common';
import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { BeginComment } from '../../../../application/use-cases/commands/task/begin-comment/begin-comment.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Binds task authorization and versioning for a comment creation. */
export const beginCommentProvider: FactoryProvider<BeginComment> = {
  provide: BeginComment,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (
    unit: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ): BeginComment => new BeginComment(unit, members, spaces),
};
