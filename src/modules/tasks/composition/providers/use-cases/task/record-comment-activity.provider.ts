import type { FactoryProvider } from '@nestjs/common';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { RecordCommentActivity } from '../../../../application/use-cases/commands/task/record-comment-activity/record-comment-activity.use-case.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Binds comment activity to the task transaction. */
export const recordCommentActivityProvider: FactoryProvider<RecordCommentActivity> = {
  provide: RecordCommentActivity,
  inject: [TASKS_UNIT_OF_WORK],
  useFactory: (unit: TasksUnitOfWork): RecordCommentActivity => new RecordCommentActivity(unit),
};
