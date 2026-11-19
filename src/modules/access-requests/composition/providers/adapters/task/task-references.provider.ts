import type { FactoryProvider } from '@nestjs/common';

import { FindTaskReference } from '../../../../../tasks/public/task/find-task-reference.js';
import { FindTaskReferences } from '../../../../../tasks/public/task/find-task-references.js';
import type { TaskReferences } from '../../../../application/ports/outbound/tasks/task/task-references.port.js';
import { TasksTaskReferences } from '../../../../infrastructure/adapters/tasks/tasks-task-references.adapter.js';
import { TASK_REFERENCES } from '../../../tokens/task/task-references.token.js';

/**
 * Constant taskReferencesProvider
 *
 * @description
 * Binds the `TaskReferences` port to the public readings `FindTaskReference` and
 * `FindTaskReferences` that `TasksModule` exports, which join the tenant transaction of the calling
 * use case.
 *
 * @type {FactoryProvider<TaskReferences>}
 */
export const taskReferencesProvider: FactoryProvider<TaskReferences> = {
  provide: TASK_REFERENCES,
  inject: [FindTaskReference, FindTaskReferences],
  useFactory: (
    findTaskReference: FindTaskReference,
    findTaskReferences: FindTaskReferences,
  ): TaskReferences => new TasksTaskReferences(findTaskReference, findTaskReferences),
};
