import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { CheckTaskAttachmentAccess } from '../../../../application/use-cases/queries/task/check-task-attachment-access/check-task-attachment-access.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Binds the snapshot access check to the task transaction and current directories. */
export const checkTaskAttachmentAccessProvider: FactoryProvider<CheckTaskAttachmentAccess> = {
  provide: CheckTaskAttachmentAccess,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ): CheckTaskAttachmentAccess => new CheckTaskAttachmentAccess(unitOfWork, members, spaces),
};
