import type { FactoryProvider } from '@nestjs/common';

import type { TargetAccessRequests } from '../../../../application/ports/outbound/access-requests/access-request/target-access-requests.port.js';
import type { DeletedSpaceLists } from '../../../../application/ports/outbound/spaces/list/deleted-space-lists.port.js';
import type { DeletedSpaceEraser } from '../../../../application/ports/outbound/spaces/space/deleted-space-eraser.port.js';
import type { DeletedListTasks } from '../../../../application/ports/outbound/tasks/trash/deleted-list-tasks.port.js';
import type { DeletionUnitOfWork } from '../../../../application/ports/outbound/transactions/deletion/deletion-unit-of-work.port.js';
import { MoveDeletedTasksToTrash } from '../../../../application/use-cases/commands/deletion/move-deleted-tasks-to-trash/move-deleted-tasks-to-trash.use-case.js';
import { TARGET_ACCESS_REQUESTS } from '../../../tokens/access-request/target-access-requests.token.js';
import { DELETION_UNIT_OF_WORK } from '../../../tokens/deletion/deletion-unit-of-work.token.js';
import { DELETED_SPACE_LISTS } from '../../../tokens/list/deleted-space-lists.token.js';
import { DELETED_SPACE_ERASER } from '../../../tokens/space/deleted-space-eraser.token.js';
import { DELETED_LIST_TASKS } from '../../../tokens/trash/deleted-list-tasks.token.js';

/**
 * Constant moveDeletedTasksToTrashProvider
 *
 * @description
 * Builds the work of the deletion job on the tenant unit of work of the module and the operations
 * of access-requests, spaces and tasks, which join each of its transactions.
 *
 * @type {FactoryProvider<MoveDeletedTasksToTrash>}
 */
export const moveDeletedTasksToTrashProvider: FactoryProvider<MoveDeletedTasksToTrash> = {
  provide: MoveDeletedTasksToTrash,
  inject: [
    DELETION_UNIT_OF_WORK,
    TARGET_ACCESS_REQUESTS,
    DELETED_SPACE_LISTS,
    DELETED_LIST_TASKS,
    DELETED_SPACE_ERASER,
  ],
  useFactory: (
    unitOfWork: DeletionUnitOfWork,
    requests: TargetAccessRequests,
    lists: DeletedSpaceLists,
    tasks: DeletedListTasks,
    spaces: DeletedSpaceEraser,
  ): MoveDeletedTasksToTrash =>
    new MoveDeletedTasksToTrash(unitOfWork, requests, lists, tasks, spaces),
};
