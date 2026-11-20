import { InvalidCommentError } from '../../../../../domain/errors/comment/invalid-comment.error.js';
import {
  commentExcerpt,
  validateCommentText,
} from '../../../../../domain/policies/comment/comment-text.policy.js';
import { CommentWriteRefusal } from '../../../../models/comment/comment-write-refusal.model.js';
import type { CommentWriteStore } from '../../../../models/comment/comment-write-store.model.js';
import type { CommentTaskWriter } from '../../../../ports/outbound/tasks/task/comment-task-writer.port.js';
import type { CommentUnitOfWork } from '../../../../ports/outbound/transactions/comment/comment-unit-of-work.port.js';
import type { CreateCommentInput } from './create-comment.input.js';
import type { CreateCommentOutput } from './create-comment.output.js';

/** Creates a comment, activity and outbox fact atomically with the task version. */
export class CreateComment {
  // #region Properties
  /** Tenant write transaction. */
  private readonly unit: CommentUnitOfWork;

  /** Task-owned authorization, version and activity. */
  private readonly tasks: CommentTaskWriter;
  // #endregion

  // #region Constructor
  /** Takes the transaction and task ports. */
  public constructor(unit: CommentUnitOfWork, tasks: CommentTaskWriter) {
    this.unit = unit;
    this.tasks = tasks;
  }
  // #endregion

  // #region Methods
  /** Checks role, validates the reply and commits the comment with its task fact. */
  public async execute(input: CreateCommentInput): Promise<CreateCommentOutput> {
    return this.unit.write(async (store: CommentWriteStore): Promise<CreateCommentOutput> => {
      const mentions = input.mentions ?? [];
      const recipientIds = [...new Set(mentions.map((mention) => mention.userId.toLowerCase()))];
      const task = await this.tasks.begin(input, recipientIds);
      if (task.outcome === 'role-insufficient')
        throw new CommentWriteRefusal(task.outcome, task.role);
      if (task.outcome !== 'ready') throw new CommentWriteRefusal(task.outcome);
      try {
        validateCommentText(input.body, mentions);
      } catch (error: unknown) {
        if (error instanceof InvalidCommentError) throw new CommentWriteRefusal('invalid');
        throw error;
      }
      if ((task.unavailableRecipientIds?.length ?? 0) > 0)
        throw new CommentWriteRefusal('recipient-invalid');
      for (const userId of recipientIds) {
        if (!(await this.tasks.canRead(input, userId)))
          throw new CommentWriteRefusal('recipient-invalid');
      }
      const reply =
        input.replyToCommentId === null
          ? null
          : await store.comments.find(
              input.organizationId,
              task.taskId,
              input.replyToCommentId,
              false,
            );
      if (input.replyToCommentId !== null && reply === null)
        throw new CommentWriteRefusal('comment-not-found');
      const recipient =
        reply !== null &&
        reply.snapshot.actorType === 'user' &&
        (await this.tasks.canRead(input, reply.snapshot.actorId))
          ? { commentId: reply.snapshot.id, userId: reply.snapshot.actorId }
          : undefined;
      const comment = await store.comments.insert({
        organizationId: input.organizationId,
        taskId: task.taskId,
        actorType: 'user',
        actorId: input.actorUserId,
        body: input.body,
        mentions,
        replyToCommentId: input.replyToCommentId,
      });
      await this.tasks.record(input, task.version, comment.snapshot.id, commentExcerpt(input.body));
      await store.events.created({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        taskKey: input.taskKey,
        taskVersion: task.version,
        spaceId: task.spaceId,
        listId: task.listId,
        commentId: comment.snapshot.id,
        commentVersion: comment.snapshot.version,
        mentionedUserIds: recipientIds,
        ...(recipient === undefined ? {} : { reply: recipient }),
      });
      return comment;
    });
  }
  // #endregion
}
