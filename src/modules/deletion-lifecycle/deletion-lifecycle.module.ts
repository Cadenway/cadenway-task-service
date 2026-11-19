import { Module } from '@nestjs/common';

import { AccessRequestsModule } from '../access-requests/access-requests.module.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { targetAccessRequestsProvider } from './composition/providers/adapters/access-request/target-access-requests.provider.js';
import { deletionUnitOfWorkProvider } from './composition/providers/adapters/deletion/deletion-unit-of-work.provider.js';
import { moveDeletedTasksToTrashHandlerProvider } from './composition/providers/adapters/deletion/move-deleted-tasks-to-trash-handler.provider.js';
import { deletedSpaceListsProvider } from './composition/providers/adapters/list/deleted-space-lists.provider.js';
import { deletedSpaceEraserProvider } from './composition/providers/adapters/space/deleted-space-eraser.provider.js';
import { deletedListTasksProvider } from './composition/providers/adapters/trash/deleted-list-tasks.provider.js';
import { dropTrashedTaskRequestsHandlerProvider } from './composition/providers/adapters/trash/drop-trashed-task-requests-handler.provider.js';
import { organizationsWithTrashProvider } from './composition/providers/adapters/trash/organizations-with-trash.provider.js';
import { purgeTrashHandlerProvider } from './composition/providers/adapters/trash/purge-trash-handler.provider.js';
import { scheduleTrashPurgeHandlerProvider } from './composition/providers/adapters/trash/schedule-trash-purge-handler.provider.js';
import { trashPurgeScheduleUnitOfWorkProvider } from './composition/providers/adapters/trash/trash-purge-schedule-unit-of-work.provider.js';
import { trashPurgeProvider } from './composition/providers/adapters/trash/trash-purge.provider.js';
import { untrashedTasksProvider } from './composition/providers/adapters/trash/untrashed-tasks.provider.js';
import { moveDeletedTasksToTrashProvider } from './composition/providers/use-cases/deletion/move-deleted-tasks-to-trash.provider.js';
import { dropTrashedTaskRequestsProvider } from './composition/providers/use-cases/trash/drop-trashed-task-requests.provider.js';
import { purgeTrashProvider } from './composition/providers/use-cases/trash/purge-trash.provider.js';
import { scheduleTrashPurgeProvider } from './composition/providers/use-cases/trash/schedule-trash-purge.provider.js';

/**
 * Class DeletionLifecycleModule
 *
 * @description
 * Composition root of the background work of the deletions and of the trash: the workers of the
 * four queues `task.trash-deleted-tasks` (the tasks of a deleted list or space moved to the trash,
 * `MoveDeletedTasksToTrash`), `task.drop-trashed-task-requests` (the pending access requests of a
 * trash entry, `DropTrashedTaskRequests`), `task.purge-trash` (the erasure of the trash of one
 * organization, `PurgeTrash`) and `task.schedule-trash-purge` (the daily schedule, at 03:00 UTC,
 * that enqueues the purge of every organization with something to erase, `ScheduleTrashPurge`),
 * and the registration of that schedule at start-up. It orchestrates `TasksModule`
 * (`TrashDeletedListTasks`, `ListUntrashedTaskIds`, `PurgeTrashBatch`,
 * `ListOrganizationsWithTrashToPurge`), `SpacesModule` (`ListDeletedSpaceLists`,
 * `PurgeDeletedSpace`) and `AccessRequestsModule`
 * (`DropTargetAccessRequests`), so that none calls another: access-requests already depends on
 * spaces and tasks, and tasks on spaces. The spaces and tasks modules enqueue the jobs in the
 * transactions of the deletions, of "Supprimer la tâche" and of "Vider la corbeille". It owns no
 * table, no route, no event and no export.
 */
@Module({
  imports: [SpacesModule, TasksModule, AccessRequestsModule],
  providers: [
    deletionUnitOfWorkProvider,
    targetAccessRequestsProvider,
    deletedSpaceListsProvider,
    deletedSpaceEraserProvider,
    deletedListTasksProvider,
    trashPurgeProvider,
    organizationsWithTrashProvider,
    untrashedTasksProvider,
    trashPurgeScheduleUnitOfWorkProvider,
    moveDeletedTasksToTrashProvider,
    dropTrashedTaskRequestsProvider,
    purgeTrashProvider,
    scheduleTrashPurgeProvider,
    moveDeletedTasksToTrashHandlerProvider,
    dropTrashedTaskRequestsHandlerProvider,
    purgeTrashHandlerProvider,
    scheduleTrashPurgeHandlerProvider,
  ],
})
export class DeletionLifecycleModule {}
