import type { FactoryProvider } from '@nestjs/common';

import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ScheduleMemberUnassignment } from '../../../../application/use-cases/commands/assignee/schedule-member-unassignment/schedule-member-unassignment.use-case.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant scheduleMemberUnassignmentProvider
 *
 * @description
 * Builds the enqueuing of the unassignment job of a removed member on the tenant unit of work of
 * the module, which member-lifecycle runs in the tenant transaction of the removal event.
 *
 * @type {FactoryProvider<ScheduleMemberUnassignment>}
 */
export const scheduleMemberUnassignmentProvider: FactoryProvider<ScheduleMemberUnassignment> = {
  provide: ScheduleMemberUnassignment,
  inject: [TASKS_UNIT_OF_WORK],
  useFactory: (unitOfWork: TasksUnitOfWork): ScheduleMemberUnassignment =>
    new ScheduleMemberUnassignment(unitOfWork),
};
