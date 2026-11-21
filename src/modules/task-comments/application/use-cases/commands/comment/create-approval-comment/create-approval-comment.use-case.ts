import {
  commentExcerpt,
  validateCommentText,
} from '../../../../../domain/policies/comment/comment-text.policy.js';
import type { CommentTaskWriter } from '../../../../ports/outbound/tasks/task/comment-task-writer.port.js';
import type { CommentUnitOfWork } from '../../../../ports/outbound/transactions/comment/comment-unit-of-work.port.js';
import type { CreateApprovalCommentInput } from './create-approval-comment.input.js';

/** Creates the comment of an approval in the transaction holding the task lock. */
export class CreateApprovalComment {
  // #region Constructor
  /** Takes the joined comment transaction and task activity port. */
  public constructor(
    private readonly unit: CommentUnitOfWork,
    private readonly tasks: CommentTaskWriter,
  ) {}
  // #endregion

  // #region Methods
  /** Persists the reserved comment, its activity and its text-free outbox fact. */
  public async execute(input: CreateApprovalCommentInput): Promise<void> {
    validateCommentText(input.body, []);
    await this.unit.write(async (store): Promise<void> => {
      const comment = await store.comments.insert({
        id: input.commentId,
        organizationId: input.organizationId,
        taskId: input.taskId,
        actorType: 'user',
        actorId: input.actorUserId,
        body: input.body,
        mentions: [],
        replyToCommentId: null,
      });
      await this.tasks.record(
        input,
        input.taskVersion,
        comment.snapshot.id,
        commentExcerpt(input.body),
      );
      await store.events.created({
        organizationId: input.organizationId,
        actor: { type: 'user', id: input.actorUserId },
        taskKey: input.taskKey,
        taskVersion: input.taskVersion,
        spaceId: input.spaceId,
        listId: input.listId,
        commentId: comment.snapshot.id,
        commentVersion: comment.snapshot.version,
        mentionedUserIds: [],
        watcherIds: input.watcherIds,
      });
    });
  }
  // #endregion
}
