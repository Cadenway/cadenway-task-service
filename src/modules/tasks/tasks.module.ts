import { recordCommentActivityProvider } from './composition/providers/use-cases/task/record-comment-activity.provider.js';
import { RecordCommentActivity } from './public/task/record-comment-activity.js';
import { beginCommentProvider } from './composition/providers/use-cases/task/begin-comment.provider.js';
import { BeginComment } from './public/task/begin-comment.js';
import { resolveCommentTaskProvider } from './composition/providers/use-cases/task/resolve-comment-task.provider.js';
import { ResolveCommentTask } from './public/task/resolve-comment-task.js';
import { Idempotent } from '@cadenway/nest-common/database';
import { Module } from '@nestjs/common';

import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { RecordFirstOnboardingTask } from '../onboarding/public/onboarding/record-first-onboarding-task.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { memberDirectoryProvider } from './composition/providers/adapters/membership/member-directory.provider.js';
import { trashWritesProvider } from './composition/providers/adapters/feature/trash-writes.provider.js';
import { spaceDirectoryProvider } from './composition/providers/adapters/space/space-directory.provider.js';
import { duplicateListProvider } from './composition/providers/use-cases/list/duplicate-list.provider.js';
import { duplicateTaskProvider } from './composition/providers/use-cases/task/duplicate-task.provider.js';
import { ListDuplicateController } from './presentation/http/controllers/duplicate/list-duplicate.controller.js';
import { TaskDuplicateController } from './presentation/http/controllers/duplicate/task-duplicate.controller.js';
import { RequiredDuplicateBodyGuard } from './presentation/http/guards/duplicate/required-duplicate-body.guard.js';
import { CustomFieldReplayAccessGuard } from './presentation/http/guards/custom-field/custom-field-replay-access.guard.js';
import { TimeEntryReplayAccessGuard } from './presentation/http/guards/time/time-entry-replay-access.guard.js';
import { tasksUnitOfWorkProvider } from './composition/providers/adapters/task/tasks-unit-of-work.provider.js';
import { trashSystemUnitOfWorkProvider } from './composition/providers/adapters/trash/trash-system-unit-of-work.provider.js';
import { listListActivityProvider } from './composition/providers/use-cases/activity/list-list-activity.provider.js';
import { taskApprovalProviders } from './composition/providers/use-cases/approval/task-approval.provider.js';
import { ChangeTaskApproval } from './public/approval/change-task-approval.js';
import { ReadTaskApproval } from './public/approval/read-task-approval.js';
import { listTaskActivityProvider } from './composition/providers/use-cases/activity/list-task-activity.provider.js';
import { taskTimeProviders } from './composition/providers/use-cases/time/task-time.provider.js';
import { archiveTaskProvider } from './composition/providers/use-cases/archive/archive-task.provider.js';
import { listArchivedListsProvider } from './composition/providers/use-cases/archive/list-archived-lists.provider.js';
import { listArchivedTasksProvider } from './composition/providers/use-cases/archive/list-archived-tasks.provider.js';
import { unarchiveTaskProvider } from './composition/providers/use-cases/archive/unarchive-task.provider.js';
import { assignTaskProvider } from './composition/providers/use-cases/assignee/assign-task.provider.js';
import { unassignRemovedMemberProvider } from './composition/providers/use-cases/assignee/unassign-removed-member.provider.js';
import { removeMemberWatcherOverridesProvider } from './composition/providers/use-cases/watcher/remove-member-watcher-overrides.provider.js';
import { unassignTaskProvider } from './composition/providers/use-cases/assignee/unassign-task.provider.js';
import { bulkTaskActionProvider } from './composition/providers/use-cases/bulk/bulk-task-action.provider.js';
import { addChecklistItemProvider } from './composition/providers/use-cases/checklist/add-checklist-item.provider.js';
import { updateChecklistItemProvider } from './composition/providers/use-cases/checklist/update-checklist-item.provider.js';
import { taskDependencyProviders } from './composition/providers/use-cases/dependency/task-dependency.provider.js';
import { customFieldProviders } from './composition/providers/use-cases/custom-field/custom-field.provider.js';
import { countListTaskGroupsProvider } from './composition/providers/use-cases/list/count-list-task-groups.provider.js';
import { getListCountsProvider } from './composition/providers/use-cases/list/get-list-counts.provider.js';
import { listListTasksProvider } from './composition/providers/use-cases/list/list-list-tasks.provider.js';
import { getSpaceOverviewProvider } from './composition/providers/use-cases/space/get-space-overview.provider.js';
import { listSpaceMilestonesProvider } from './composition/providers/use-cases/space/list-space-milestones.provider.js';
import { listLabelsProvider } from './composition/providers/use-cases/label/list-labels.provider.js';
import { getHomeProvider } from './composition/providers/use-cases/user/get-home.provider.js';
import { listMyTasksProvider } from './composition/providers/use-cases/user/list-my-tasks.provider.js';
import { addTaskLabelProvider } from './composition/providers/use-cases/label/add-task-label.provider.js';
import { removeTaskLabelProvider } from './composition/providers/use-cases/label/remove-task-label.provider.js';
import { createSubtaskProvider } from './composition/providers/use-cases/subtask/create-subtask.provider.js';
import { listSubtasksProvider } from './composition/providers/use-cases/subtask/list-subtasks.provider.js';
import { checkTaskAccessProvider } from './composition/providers/use-cases/task/check-task-access.provider.js';
import { createTaskProvider } from './composition/providers/use-cases/task/create-task.provider.js';
import { createOnboardingExampleProvider } from './composition/providers/use-cases/onboarding/create-onboarding-example.provider.js';
import { CreateOnboardingExample } from './public/onboarding/create-onboarding-example.js';
import { FIRST_ONBOARDING_TASK } from './composition/tokens/onboarding/first-onboarding-task.token.js';
import type { FirstOnboardingTask } from './application/ports/outbound/onboarding/checklist/first-onboarding-task.port.js';
import { findTaskReferenceProvider } from './composition/providers/use-cases/task/find-task-reference.provider.js';
import { findTaskReferencesProvider } from './composition/providers/use-cases/task/find-task-references.provider.js';
import { getTaskDetailProvider } from './composition/providers/use-cases/task/get-task-detail.provider.js';
import { readTaskTemplateSourceProvider } from './composition/providers/use-cases/task/read-task-template-source.provider.js';
import { getTaskProvider } from './composition/providers/use-cases/task/get-task.provider.js';
import { listTaskParticipantsProvider } from './composition/providers/use-cases/task/list-task-participants.provider.js';
import { updateTaskProvider } from './composition/providers/use-cases/task/update-task.provider.js';
import { emptyTrashProvider } from './composition/providers/use-cases/trash/empty-trash.provider.js';
import { listOrganizationsWithTrashToPurgeProvider } from './composition/providers/use-cases/trash/list-organizations-with-trash-to-purge.provider.js';
import { listTrashEntriesProvider } from './composition/providers/use-cases/trash/list-trash-entries.provider.js';
import { listUntrashedTaskIdsProvider } from './composition/providers/use-cases/trash/list-untrashed-task-ids.provider.js';
import { purgeTrashBatchProvider } from './composition/providers/use-cases/trash/purge-trash-batch.provider.js';
import { purgeTrashEntryProvider } from './composition/providers/use-cases/trash/purge-trash-entry.provider.js';
import { restoreTrashEntryProvider } from './composition/providers/use-cases/trash/restore-trash-entry.provider.js';
import { trashDeletedListTasksProvider } from './composition/providers/use-cases/trash/trash-deleted-list-tasks.provider.js';
import { trashTaskProvider } from './composition/providers/use-cases/trash/trash-task.provider.js';
import { ListCountsController } from './presentation/http/controllers/count/list-counts.controller.js';
import { SpaceOverviewController } from './presentation/http/controllers/count/space-overview.controller.js';
import { SpaceMilestonesController } from './presentation/http/controllers/milestone/space-milestones.controller.js';
import { LabelsController } from './presentation/http/controllers/label/labels.controller.js';
import { TaskGroupsController } from './presentation/http/controllers/query/task-groups.controller.js';
import { UserTasksController } from './presentation/http/controllers/user/user-tasks.controller.js';
import { ListActivityController } from './presentation/http/controllers/activity/list-activity.controller.js';
import { TaskAccessController } from './presentation/http/controllers/access/task-access.controller.js';
import { TaskActivityController } from './presentation/http/controllers/activity/task-activity.controller.js';
import { TaskTimeController } from './presentation/http/controllers/time/task-time.controller.js';
import { ArchivesController } from './presentation/http/controllers/archive/archives.controller.js';
import { TaskArchiveController } from './presentation/http/controllers/archive/task-archive.controller.js';
import { TaskAssigneesController } from './presentation/http/controllers/assignee/task-assignees.controller.js';
import { BulkTaskActionsController } from './presentation/http/controllers/bulk/bulk-task-actions.controller.js';
import { TaskWatchersController } from './presentation/http/controllers/watcher/task-watchers.controller.js';
import { listWatchersProvider } from './composition/providers/use-cases/watcher/list-watchers.provider.js';
import { setTaskWatcherProvider } from './composition/providers/use-cases/watcher/set-task-watcher.provider.js';
import { ChecklistItemsController } from './presentation/http/controllers/checklist/checklist-items.controller.js';
import { TaskDependenciesController } from './presentation/http/controllers/dependency/task-dependencies.controller.js';
import { ListCustomFieldsController } from './presentation/http/controllers/custom-field/list-custom-fields.controller.js';
import { SpaceCustomFieldsController } from './presentation/http/controllers/custom-field/space-custom-fields.controller.js';
import { TaskLabelsController } from './presentation/http/controllers/label/task-labels.controller.js';
import { SubtasksController } from './presentation/http/controllers/subtask/subtasks.controller.js';
import { ReadTaskTemplateSource } from './public/task/read-task-template-source.js';
import { ListTasksController } from './presentation/http/controllers/task/list-tasks.controller.js';
import { TaskParticipantsController } from './presentation/http/controllers/task/task-participants.controller.js';
import { TasksController } from './presentation/http/controllers/task/tasks.controller.js';
import { TaskTrashController } from './presentation/http/controllers/trash/task-trash.controller.js';
import { TrashController } from './presentation/http/controllers/trash/trash.controller.js';
import { UnassignRemovedMember } from './public/assignee/unassign-removed-member.js';
import { RemoveMemberWatcherOverrides } from './public/watcher/remove-member-watcher-overrides.js';
import { FindTaskReference } from './public/task/find-task-reference.js';
import { FindTaskReferences } from './public/task/find-task-references.js';
import { ListOrganizationsWithTrashToPurge } from './public/trash/list-organizations-with-trash-to-purge.js';
import { ListUntrashedTaskIds } from './public/trash/list-untrashed-task-ids.js';
import { PurgeTrashBatch } from './public/trash/purge-trash-batch.js';
import { TrashDeletedListTasks } from './public/trash/trash-deleted-list-tasks.js';

/**
 * Function markIdempotent
 *
 * @description
 * Marks a write route `@Idempotent()`, so that the `Idempotency-Key` interceptor of
 * `DatabaseModule` (`idempotency: true` in `AppModule`) records its answer with the key for 24 hours
 * and replays it, with the recorded `Location` and `ETag` ("Creations" of
 * `openapi/internal/task-service.yaml`). The decorator of the kit lives in
 * `@cadenway/nest-common/database`, an adapter entry the strict layout keeps out of
 * `presentation/`; the composition root applies it to the handler instead, the same metadata the
 * decorator would set.
 *
 * @param {object} prototype - The prototype of the controller.
 * @param {string} method - The name of its write handler.
 * @throws {Error} When the controller has no such handler: the module does not load.
 */
function markIdempotent(prototype: object, method: string): void {
  const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
    prototype,
    method,
  );
  if (descriptor === undefined) {
    throw new Error(`The controller has no handler ${method} to mark idempotent.`);
  }
  Idempotent()(prototype, method, descriptor);
}

markIdempotent(ListTasksController.prototype, 'create');
markIdempotent(SubtasksController.prototype, 'create');
markIdempotent(ChecklistItemsController.prototype, 'add');
markIdempotent(TaskDependenciesController.prototype, 'create');
markIdempotent(ListDuplicateController.prototype, 'duplicate');
markIdempotent(TaskDuplicateController.prototype, 'duplicate');
markIdempotent(BulkTaskActionsController.prototype, 'execute');
markIdempotent(SpaceCustomFieldsController.prototype, 'create');
markIdempotent(TaskTimeController.prototype, 'create');

/**
 * Class TasksModule
 *
 * @description
 * Composition root of the tasks (P3a): their subtasks, assignees, labels and checklist, the activity
 * log of a task and of a list, and the queries (the tasks of a list with their filters, sorts and
 * groups, the counters of a list and of a space, the labels, "Mes tâches" and "Accueil") and the
 * archives of the tasks (P3b-1: archive, restoration and the page "Archives") and the trash
 * (P3b-1 PR 3: deletion, restoration, erasure, "Vider la corbeille" and the page "Corbeille"). The
 * use cases run on one tenant unit of work that appends their events to the outbox, and inserts
 * the jobs of the trash, in the same transaction. They read the role of the actor, and of the
 * people to assign, from `OrganizationMembersModule` through the `MemberDirectory` port, never from
 * the `role` claim of the internal token (decision 4 of the P3a plan), and the lists, the spaces,
 * the role of the actor on them and the task keys from `SpacesModule` through the `SpaceDirectory`
 * port. `TaskAccessController` serves the access check of a task to the realtime gateway, the only
 * route of the module it accepts. It exports `UnassignRemovedMember`, one batch of the removal of a
 * former member from their tasks, which the clean-up job of the member-lifecycle module runs batch
 * after batch once the member left the organization, `FindTaskReference` and
 * `FindTaskReferences`, which the access-requests module reads tasks with, and the four entries
 * of the jobs of the deletion-lifecycle module: `TrashDeletedListTasks` and `PurgeTrashBatch`
 * (tenant batches), `ListUntrashedTaskIds` (the tasks of an entry whose requests stay) and
 * `ListOrganizationsWithTrashToPurge` (on a read-only system unit of work, the only
 * cross-organization read of the module).

 */
@Module({
  imports: [OrganizationMembersModule, SpacesModule],
  controllers: [
    ListCustomFieldsController,
    SpaceCustomFieldsController,
    ListTasksController,
    ListActivityController,
    TaskGroupsController,
    ListCountsController,
    SpaceOverviewController,
    SpaceMilestonesController,
    LabelsController,
    UserTasksController,
    BulkTaskActionsController,
    TasksController,
    TaskAssigneesController,
    TaskWatchersController,
    TaskLabelsController,
    SubtasksController,
    ChecklistItemsController,
    TaskDependenciesController,
    TaskDuplicateController,
    ListDuplicateController,
    TaskActivityController,
    TaskTimeController,
    TaskArchiveController,
    ArchivesController,
    TaskTrashController,
    TrashController,
    TaskAccessController,
    TaskParticipantsController,
  ],
  providers: [
    {
      provide: FIRST_ONBOARDING_TASK,
      inject: [RecordFirstOnboardingTask],
      useFactory: (marker: RecordFirstOnboardingTask): FirstOnboardingTask => ({
        record: (organizationId, actorUserId, spaceId) =>
          marker.execute({ organizationId, actorUserId, spaceId }),
      }),
    },
    CustomFieldReplayAccessGuard,
    ...customFieldProviders,
    TimeEntryReplayAccessGuard,
    ...taskApprovalProviders,
    RequiredDuplicateBodyGuard,
    tasksUnitOfWorkProvider,
    memberDirectoryProvider,
    spaceDirectoryProvider,
    trashWritesProvider,
    createTaskProvider,
    createOnboardingExampleProvider,
    duplicateTaskProvider,
    duplicateListProvider,
    updateTaskProvider,
    bulkTaskActionProvider,
    getTaskProvider,
    getTaskDetailProvider,
    readTaskTemplateSourceProvider,
    listTaskParticipantsProvider,
    createSubtaskProvider,
    listSubtasksProvider,
    assignTaskProvider,
    listWatchersProvider,
    setTaskWatcherProvider,
    unassignTaskProvider,
    unassignRemovedMemberProvider,
    removeMemberWatcherOverridesProvider,
    addTaskLabelProvider,
    removeTaskLabelProvider,
    addChecklistItemProvider,
    updateChecklistItemProvider,
    ...taskDependencyProviders,
    listTaskActivityProvider,
    ...taskTimeProviders,
    listListActivityProvider,
    listListTasksProvider,
    countListTaskGroupsProvider,
    getListCountsProvider,
    getSpaceOverviewProvider,
    listSpaceMilestonesProvider,
    listLabelsProvider,
    listMyTasksProvider,
    getHomeProvider,
    checkTaskAccessProvider,
    resolveCommentTaskProvider,
    beginCommentProvider,
    recordCommentActivityProvider,
    findTaskReferenceProvider,
    findTaskReferencesProvider,
    archiveTaskProvider,
    unarchiveTaskProvider,
    listArchivedTasksProvider,
    listArchivedListsProvider,
    trashSystemUnitOfWorkProvider,
    trashTaskProvider,
    listTrashEntriesProvider,
    purgeTrashEntryProvider,
    restoreTrashEntryProvider,
    emptyTrashProvider,
    trashDeletedListTasksProvider,
    purgeTrashBatchProvider,
    listOrganizationsWithTrashToPurgeProvider,
    listUntrashedTaskIdsProvider,
  ],
  exports: [
    CreateOnboardingExample,
    ChangeTaskApproval,
    ReadTaskApproval,
    ReadTaskTemplateSource,
    UnassignRemovedMember,
    RemoveMemberWatcherOverrides,
    FindTaskReference,
    ResolveCommentTask,
    BeginComment,
    RecordCommentActivity,
    FindTaskReferences,
    TrashDeletedListTasks,
    PurgeTrashBatch,
    ListOrganizationsWithTrashToPurge,
    ListUntrashedTaskIds,
  ],
})
export class TasksModule {}
