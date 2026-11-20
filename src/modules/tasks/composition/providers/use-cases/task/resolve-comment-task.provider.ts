import type { FactoryProvider } from '@nestjs/common';
import { CheckTaskAccess } from '../../../../application/use-cases/queries/task/check-task-access/check-task-access.use-case.js';
import { FindTaskReference } from '../../../../application/use-cases/queries/task/find-task-reference/find-task-reference.use-case.js';
import { ResolveCommentTask } from '../../../../application/use-cases/queries/task/resolve-comment-task/resolve-comment-task.use-case.js';

/** Binds comment task resolution to the task access and identity operations. */
export const resolveCommentTaskProvider: FactoryProvider<ResolveCommentTask> = {
  provide: ResolveCommentTask,
  inject: [CheckTaskAccess, FindTaskReference],
  useFactory: (access: CheckTaskAccess, reference: FindTaskReference): ResolveCommentTask =>
    new ResolveCommentTask(access, reference),
};
