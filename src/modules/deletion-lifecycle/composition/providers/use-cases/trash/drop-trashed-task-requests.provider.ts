import type { FactoryProvider } from '@nestjs/common';

import type { TargetAccessRequests } from '../../../../application/ports/outbound/access-requests/access-request/target-access-requests.port.js';
import type { UntrashedTasks } from '../../../../application/ports/outbound/tasks/trash/untrashed-tasks.port.js';
import type { DeletionUnitOfWork } from '../../../../application/ports/outbound/transactions/deletion/deletion-unit-of-work.port.js';
import { DropTrashedTaskRequests } from '../../../../application/use-cases/commands/trash/drop-trashed-task-requests/drop-trashed-task-requests.use-case.js';
import { TARGET_ACCESS_REQUESTS } from '../../../tokens/access-request/target-access-requests.token.js';
import { DELETION_UNIT_OF_WORK } from '../../../tokens/deletion/deletion-unit-of-work.token.js';
import { UNTRASHED_TASKS } from '../../../tokens/trash/untrashed-tasks.token.js';

/**
 * Constant dropTrashedTaskRequestsProvider
 *
 * @description
 * Builds the work of the job of the requests of a trash entry on the tenant unit of work of the
 * module, `ListUntrashedTaskIds` of tasks and `DropTargetAccessRequests` of access-requests, which
 * both join it.
 *
 * @type {FactoryProvider<DropTrashedTaskRequests>}
 */
export const dropTrashedTaskRequestsProvider: FactoryProvider<DropTrashedTaskRequests> = {
  provide: DropTrashedTaskRequests,
  inject: [DELETION_UNIT_OF_WORK, UNTRASHED_TASKS, TARGET_ACCESS_REQUESTS],
  useFactory: (
    unitOfWork: DeletionUnitOfWork,
    tasks: UntrashedTasks,
    requests: TargetAccessRequests,
  ): DropTrashedTaskRequests => new DropTrashedTaskRequests(unitOfWork, tasks, requests),
};
