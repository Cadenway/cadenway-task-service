import { Idempotent } from '@cadenway/nest-common/database';
import { Module } from '@nestjs/common';

import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { memberDirectoryProvider } from './composition/providers/adapters/membership/member-directory.provider.js';
import { spaceDirectoryProvider } from './composition/providers/adapters/space/space-directory.provider.js';
import { tasksUnitOfWorkProvider } from './composition/providers/adapters/task/tasks-unit-of-work.provider.js';
import { listListActivityProvider } from './composition/providers/use-cases/activity/list-list-activity.provider.js';
import { listTaskActivityProvider } from './composition/providers/use-cases/activity/list-task-activity.provider.js';
import { assignTaskProvider } from './composition/providers/use-cases/assignee/assign-task.provider.js';
import { unassignRemovedMemberProvider } from './composition/providers/use-cases/assignee/unassign-removed-member.provider.js';
import { unassignTaskProvider } from './composition/providers/use-cases/assignee/unassign-task.provider.js';
import { addChecklistItemProvider } from './composition/providers/use-cases/checklist/add-checklist-item.provider.js';
import { updateChecklistItemProvider } from './composition/providers/use-cases/checklist/update-checklist-item.provider.js';
import { addTaskLabelProvider } from './composition/providers/use-cases/label/add-task-label.provider.js';
import { removeTaskLabelProvider } from './composition/providers/use-cases/label/remove-task-label.provider.js';
import { createSubtaskProvider } from './composition/providers/use-cases/subtask/create-subtask.provider.js';
import { listSubtasksProvider } from './composition/providers/use-cases/subtask/list-subtasks.provider.js';
import { createTaskProvider } from './composition/providers/use-cases/task/create-task.provider.js';
import { getTaskDetailProvider } from './composition/providers/use-cases/task/get-task-detail.provider.js';
import { getTaskProvider } from './composition/providers/use-cases/task/get-task.provider.js';
import { updateTaskProvider } from './composition/providers/use-cases/task/update-task.provider.js';
import { ListActivityController } from './presentation/http/controllers/activity/list-activity.controller.js';
import { TaskActivityController } from './presentation/http/controllers/activity/task-activity.controller.js';
import { TaskAssigneesController } from './presentation/http/controllers/assignee/task-assignees.controller.js';
import { ChecklistItemsController } from './presentation/http/controllers/checklist/checklist-items.controller.js';
import { TaskLabelsController } from './presentation/http/controllers/label/task-labels.controller.js';
import { SubtasksController } from './presentation/http/controllers/subtask/subtasks.controller.js';
import { ListTasksController } from './presentation/http/controllers/task/list-tasks.controller.js';
import { TasksController } from './presentation/http/controllers/task/tasks.controller.js';
import { UnassignRemovedMember } from './public/assignee/unassign-removed-member.js';

/**
 * Function markIdempotent
 *
 * @description
 * Marks a creation route `@Idempotent()`, so that the `Idempotency-Key` interceptor of
 * `DatabaseModule` (`idempotency: true` in `AppModule`) records its answer with the key for 24 hours
 * and replays it, with the recorded `Location` and `ETag` ("Creations" of
 * `openapi/internal/task-service.yaml`). The decorator of the kit lives in
 * `@cadenway/nest-common/database`, an adapter entry the strict layout keeps out of
 * `presentation/`; the composition root applies it to the handler instead, the same metadata the
 * decorator would set.
 *
 * @param {object} prototype - The prototype of the controller.
 * @param {string} method - The name of its creation handler.
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

/**
 * Class TasksModule
 *
 * @description
 * Composition root of the tasks (P3a): their subtasks, assignees, labels and checklist, and the
 * activity log of a task and of a list. The use cases run on one tenant unit of work that appends
 * their events to the outbox in the same transaction. They read the role of the actor, and of the
 * people to assign, from `OrganizationMembersModule` through the `MemberDirectory` port, never from
 * the `role` claim of the internal token (decision 4 of the P3a plan), and the lists, the spaces
 * and the task keys from `SpacesModule` through the `SpaceDirectory` port. It exports
 * `UnassignRemovedMember`, one batch of the removal of a former member from their tasks, which the
 * clean-up job of the member-lifecycle module runs batch after batch once the member left the
 * organization.
 */
@Module({
  imports: [OrganizationMembersModule, SpacesModule],
  controllers: [
    ListTasksController,
    ListActivityController,
    TasksController,
    TaskAssigneesController,
    TaskLabelsController,
    SubtasksController,
    ChecklistItemsController,
    TaskActivityController,
  ],
  providers: [
    tasksUnitOfWorkProvider,
    memberDirectoryProvider,
    spaceDirectoryProvider,
    createTaskProvider,
    updateTaskProvider,
    getTaskProvider,
    getTaskDetailProvider,
    createSubtaskProvider,
    listSubtasksProvider,
    assignTaskProvider,
    unassignTaskProvider,
    unassignRemovedMemberProvider,
    addTaskLabelProvider,
    removeTaskLabelProvider,
    addChecklistItemProvider,
    updateChecklistItemProvider,
    listTaskActivityProvider,
    listListActivityProvider,
  ],
  exports: [UnassignRemovedMember],
})
export class TasksModule {}
