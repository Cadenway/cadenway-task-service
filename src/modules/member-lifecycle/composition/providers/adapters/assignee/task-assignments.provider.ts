import type { FactoryProvider } from '@nestjs/common';

import { UnassignRemovedMember } from '../../../../../tasks/public/assignee/unassign-removed-member.js';
import type { TaskAssignments } from '../../../../application/ports/outbound/tasks/assignee/task-assignments.port.js';
import { TasksTaskAssignments } from '../../../../infrastructure/adapters/tasks/task-assignments.adapter.js';
import { TASK_ASSIGNMENTS } from '../../../tokens/assignee/task-assignments.token.js';

/**
 * Constant taskAssignmentsProvider
 *
 * @description
 * Binds the `TaskAssignments` port to the public operation `UnassignRemovedMember` that
 * `TasksModule` exports.
 *
 * @type {FactoryProvider<TaskAssignments>}
 */
export const taskAssignmentsProvider: FactoryProvider<TaskAssignments> = {
  provide: TASK_ASSIGNMENTS,
  inject: [UnassignRemovedMember],
  useFactory: (unassignRemovedMember: UnassignRemovedMember): TaskAssignments =>
    new TasksTaskAssignments(unassignRemovedMember),
};
