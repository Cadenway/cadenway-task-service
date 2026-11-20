import { CommentReadRefusal } from '../../../../models/comment/comment-read-refusal.model.js';
import type { CommentStore } from '../../../../models/comment/comment-store.model.js';
import type { CommentTaskDirectory } from '../../../../ports/outbound/tasks/task/comment-task-directory.port.js';
import type { CommentUnitOfWork } from '../../../../ports/outbound/transactions/comment/comment-unit-of-work.port.js';
import type { ListCommentsInput } from './list-comments.input.js';
import type { ListCommentsOutput } from './list-comments.output.js';

/** Lists live task comments in a single authorized tenant snapshot. */
export class ListComments {
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
  /** Returns a bounded page and total after checking task visibility. */
  public async execute(input: ListCommentsInput): Promise<ListCommentsOutput> {
    return this.unit.read(async (store: CommentStore): Promise<ListCommentsOutput> => {
      const task = await this.tasks.resolve(input);
      if (task.outcome !== 'found') throw new CommentReadRefusal(task.outcome);
      const rows = await store.comments.list(
        input.organizationId,
        task.taskId,
        input.after,
        input.limit + 1,
      );
      const items = rows.slice(0, input.limit);
      const last = items.at(-1)?.snapshot;
      return {
        items,
        total: await store.comments.count(input.organizationId, task.taskId),
        next:
          rows.length > input.limit && last !== undefined
            ? { id: last.id, createdAt: last.createdAt }
            : null,
      };
    });
  }
  // #endregion
}
