import { CommentTrashedTaskRefusal } from '../../../../models/comment/comment-trashed-task-refusal.model.js';
import { CommentReadRefusal } from '../../../../models/comment/comment-read-refusal.model.js';
import type { CommentStore } from '../../../../models/comment/comment-store.model.js';
import type { CommentTaskDirectory } from '../../../../ports/outbound/tasks/task/comment-task-directory.port.js';
import type { CommentUnitOfWork } from '../../../../ports/outbound/transactions/comment/comment-unit-of-work.port.js';
import type { GetCommentInput } from './get-comment.input.js';
import type { GetCommentOutput } from './get-comment.output.js';

/** Reads a live comment only after checking task visibility. */
export class GetComment {
  // #region Properties
  /** Tenant snapshot. */
  private readonly unit: CommentUnitOfWork;

  /** Visibility of the task. */
  private readonly tasks: CommentTaskDirectory;
  // #endregion

  // #region Constructor
  /** Takes the tenant transaction and task visibility ports. */
  public constructor(unit: CommentUnitOfWork, tasks: CommentTaskDirectory) {
    this.unit = unit;
    this.tasks = tasks;
  }
  // #endregion

  // #region Methods
  /** Reads one live comment scoped to the visible task. */
  public async execute(input: GetCommentInput): Promise<GetCommentOutput> {
    return this.unit.read(async (store: CommentStore): Promise<GetCommentOutput> => {
      const task = await this.tasks.resolve(input);
      if (task.outcome === 'task-trashed') throw new CommentTrashedTaskRefusal(task.details);
      if (task.outcome !== 'found') throw new CommentReadRefusal(task.outcome);
      const comment = await store.comments.find(
        input.organizationId,
        task.taskId,
        input.commentId,
        false,
      );
      if (comment === null) throw new CommentReadRefusal('comment-not-found');
      return comment;
    });
  }
  // #endregion
}
