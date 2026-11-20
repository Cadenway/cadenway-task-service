import { InvalidCommentError } from '../../../../../domain/errors/comment/invalid-comment.error.js';
import { mentionRecipientChanges } from '../../../../../domain/policies/comment/mention-recipient-changes.policy.js';
import {
  commentExcerpt,
  validateCommentText,
} from '../../../../../domain/policies/comment/comment-text.policy.js';
import { CommentTrashedTaskRefusal } from '../../../../models/comment/comment-trashed-task-refusal.model.js';
import { CommentWriteRefusal } from '../../../../models/comment/comment-write-refusal.model.js';
import type { CommentWriteStore } from '../../../../models/comment/comment-write-store.model.js';
import type { CommentTaskWriter } from '../../../../ports/outbound/tasks/task/comment-task-writer.port.js';
import type { CommentUnitOfWork } from '../../../../ports/outbound/transactions/comment/comment-unit-of-work.port.js';
import type { ChangeCommentInput } from './change-comment.input.js';
import type { ChangeCommentOutput } from './change-comment.output.js';

/** Changes a comment and its task activity and outbox in one tenant transaction. */
export class ChangeComment {
  // #region Properties
  /** Tenant write transaction. */
  private readonly unit: CommentUnitOfWork;

  /** Task authorization, version and activity. */
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
  /** Checks task role before comment identity, author and version. */
  public async execute(input: ChangeCommentInput): Promise<ChangeCommentOutput> {
    return this.unit.write(async (store: CommentWriteStore): Promise<ChangeCommentOutput> => {
      const supplied = input.mentions ?? [];
      const recipientIds = [...new Set(supplied.map((mention) => mention.userId.toLowerCase()))];
      const task = await this.tasks.begin(input, recipientIds);
      if (task.outcome === 'task-trashed') throw new CommentTrashedTaskRefusal(task.details);
      if (task.outcome === 'role-insufficient')
        throw new CommentWriteRefusal(task.outcome, task.role);
      if (task.outcome !== 'ready') throw new CommentWriteRefusal(task.outcome);
      const current = await store.comments.find(
        input.organizationId,
        task.taskId,
        input.commentId,
        false,
      );
      if (current === null) throw new CommentWriteRefusal('comment-not-found');
      if (
        current.snapshot.actorType !== 'user' ||
        current.snapshot.actorId.toLowerCase() !== input.actorUserId.toLowerCase()
      )
        throw new CommentWriteRefusal('author-required');
      if (
        input.expectedVersions !== null &&
        !input.expectedVersions.includes(current.snapshot.version)
      )
        throw new CommentWriteRefusal('version-mismatch', null, current.snapshot.version);
      const body = input.body === undefined ? current.snapshot.body : input.body;
      if (input.body === undefined && body === null) throw new Error('A live comment has no text.');
      const mentions =
        body === null
          ? []
          : (input.mentions ?? (input.body === undefined ? current.snapshot.mentions : []));
      if (body !== null) {
        try {
          validateCommentText(body, mentions);
        } catch (error: unknown) {
          if (error instanceof InvalidCommentError) {
            throw new CommentWriteRefusal(
              error.path === 'mentions' ? 'invalid-mentions' : 'invalid',
            );
          }
          throw error;
        }
        if ((task.unavailableRecipientIds?.length ?? 0) > 0)
          throw new CommentWriteRefusal('recipient-invalid');
        for (const userId of recipientIds) {
          if (!(await this.tasks.canRead(input, userId)))
            throw new CommentWriteRefusal('recipient-invalid');
        }
      }
      const changes = mentionRecipientChanges(current.snapshot.mentions, mentions);
      const next =
        body === null ? current.delete(task.instant) : current.edit(body, task.instant, mentions);
      if (!(await store.comments.update(next, current.snapshot.version)))
        throw new Error('The locked comment changed unexpectedly.');
      await this.tasks.change(
        input,
        task.version,
        current.snapshot.id,
        body === null ? null : commentExcerpt(body),
      );
      const event = {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        taskKey: input.taskKey,
        taskVersion: task.version,
        spaceId: task.spaceId,
        listId: task.listId,
        commentId: current.snapshot.id,
        commentVersion: next.snapshot.version,
        addedMentionUserIds: changes.added,
        removedMentionUserIds: changes.removed,
      };
      if (body === null) await store.events.deleted(event);
      else await store.events.updated(event);
      return next;
    });
  }
  // #endregion
}
