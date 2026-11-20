import type { ResolveCommentTask } from '../../../../tasks/public/task/resolve-comment-task.js';
import type { CommentReadInput } from '../../../application/models/comment/comment-read-input.model.js';
import type { CommentTaskResult } from '../../../application/models/comment/comment-task-result.model.js';
import type { CommentTaskDirectory } from '../../../application/ports/outbound/tasks/task/comment-task-directory.port.js';

/** Adapts the tasks module's public visibility operation to comment reads. */
export class TasksCommentDirectory implements CommentTaskDirectory {
  // #region Properties
  /** Public task resolver. */
  private readonly resolver: ResolveCommentTask;
  // #endregion

  // #region Constructor
  /** Takes the task resolver. */
  public constructor(resolver: ResolveCommentTask) {
    this.resolver = resolver;
  }
  // #endregion

  // #region Methods
  /** Resolves the visible task in the current tenant snapshot. */
  public async resolve(input: CommentReadInput): Promise<CommentTaskResult> {
    return this.resolver.execute(input);
  }
  // #endregion
}
