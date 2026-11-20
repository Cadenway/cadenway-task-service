import type { FactoryProvider } from '@nestjs/common';

import type { TrashWrites } from '../../../../application/ports/outbound/feature/trash/trash-writes.port.js';
import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { BulkTaskAction } from '../../../../application/use-cases/commands/bulk/bulk-task-action/bulk-task-action.use-case.js';
import { TRASH_WRITES } from '../../../tokens/feature/trash-writes.token.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Binds grouped task writes to the tenant transaction and source directories. */
export const bulkTaskActionProvider: FactoryProvider<BulkTaskAction> = {
  provide: BulkTaskAction,
  inject: [TRASH_WRITES, TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (
    writes: TrashWrites,
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ): BulkTaskAction => new BulkTaskAction(writes, unitOfWork, members, spaces),
};
