import type { ResolveCommentTask } from '../../../../tasks/public/task/resolve-comment-task.js';
import type { BeginComment } from '../../../../tasks/public/task/begin-comment.js';
import type { RecordCommentActivity } from '../../../../tasks/public/task/record-comment-activity.js';
import type { CommentReadInput } from '../../../application/models/comment/comment-read-input.model.js';
import type { CommentWriteTask } from '../../../application/models/comment/comment-write-task.model.js';
import type { CommentTaskWriter } from '../../../application/ports/outbound/tasks/task/comment-task-writer.port.js';

/** Adapts task-owned authorization, versioning and activity to comment creation. */
export class TasksCommentWriter implements CommentTaskWriter {
  // #region Properties
  /** Task version operation. */
  private readonly beginComment: BeginComment;

  /** Task activity operation. */
  private readonly activity: RecordCommentActivity;

  /** Reply recipient access resolver. */
  private readonly resolver: ResolveCommentTask;
  // #endregion

  // #region Constructor
  /** Takes task-owned operations. */
  public constructor(
    beginComment: BeginComment,
    activity: RecordCommentActivity,
    resolver: ResolveCommentTask,
  ) {
    this.beginComment = beginComment;
    this.activity = activity;
    this.resolver = resolver;
  }
  // #endregion

  // #region Methods
  /** Authorizes and versions the task. */
  public async begin(
    input: CommentReadInput,
    recipientIds: readonly string[] = [],
  ): Promise<CommentWriteTask> {
    return this.beginComment.execute({ ...input, recipientIds });
  }

  /** Records comment activity. */
  public async record(
    input: CommentReadInput,
    taskVersion: number,
    commentId: string,
    excerpt: string,
  ): Promise<void> {
    await this.activity.execute({ ...input, taskVersion, commentId, excerpt });
  }

  /** Updates or removes comment activity while its task lock is held. */
  public async change(
    input: CommentReadInput,
    taskVersion: number,
    commentId: string,
    excerpt: string | null,
  ): Promise<void> {
    await this.activity.execute({
      ...input,
      taskVersion,
      commentId,
      excerpt: excerpt ?? '',
      change: excerpt === null ? 'delete' : 'edit',
    });
  }

  /** Checks whether the human reply target still sees the task. */
  public async canRead(input: CommentReadInput, userId: string): Promise<boolean> {
    return (
      (await this.resolver.execute({ ...input, actorUserId: userId, joinWrite: true })).outcome ===
      'found'
    );
  }
  // #endregion
}
