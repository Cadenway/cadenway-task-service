import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { CheckTaskAccess } from '../check-task-access/check-task-access.use-case.js';
import type { FindTaskReference } from '../find-task-reference/find-task-reference.use-case.js';
import type { ResolveCommentTaskInput } from './resolve-comment-task.input.js';
import type { ResolveCommentTaskOutput } from './resolve-comment-task.output.js';

/** Resolves a visible task for comment reads within the caller's tenant snapshot. */
export class ResolveCommentTask {
  // #region Properties
  /** The task visibility check. */
  private readonly access: CheckTaskAccess;

  /** The task identity lookup. */
  private readonly reference: FindTaskReference;
  // #endregion

  // #region Constructor
  /** Takes the two task operations, which join the caller's transaction. */
  public constructor(access: CheckTaskAccess, reference: FindTaskReference) {
    this.access = access;
    this.reference = reference;
  }
  // #endregion

  // #region Methods
  /** Checks visibility before returning the internal task identity. */
  public async execute(input: ResolveCommentTaskInput): Promise<ResolveCommentTaskOutput> {
    try {
      await this.access.execute(input);
      const task = await this.reference.execute({
        organizationId: input.organizationId,
        taskKey: input.taskKey,
      });
      return task === null ? { outcome: 'task-not-found' } : { outcome: 'found', taskId: task.id };
    } catch (error: unknown) {
      if (
        error instanceof TaskRefusal &&
        (error.refusal.reason === 'task-not-found' ||
          error.refusal.reason === 'organization-not-found')
      ) {
        return { outcome: error.refusal.reason };
      }
      throw error;
    }
  }
  // #endregion
}
