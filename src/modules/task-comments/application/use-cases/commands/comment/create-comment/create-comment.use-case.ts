import { InvalidCommentError } from '../../../../../domain/errors/comment/invalid-comment.error.js';
import {
  commentExcerpt,
  validateCommentText,
} from '../../../../../domain/policies/comment/comment-text.policy.js';
import type { AutomationCommentInput } from '../../../../models/comment/automation-comment-input.model.js';
import type { CommentReadInput } from '../../../../models/comment/comment-read-input.model.js';
import type { CommentCreated } from '../../../../models/comment/comment-created.model.js';
import { CommentTrashedTaskRefusal } from '../../../../models/comment/comment-trashed-task-refusal.model.js';
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
    return this.create(input, { type: 'user', id: input.actorUserId });
  }

  /** Creates a rule-authored comment using the current authority of the rule author. */
  public async executeAutomation(input: AutomationCommentInput): Promise<void> {
    await this.create(
      {
        organizationId: input.organizationId,
        actorUserId: input.ruleAuthorUserId,
        taskKey: input.taskKey,
        body: input.body,
        replyToCommentId: null,
      },
      { type: 'automation', id: input.ruleId },
    );
  }

  /** Checks the rule author's current edit access before an idempotent receipt can replay. */
  public async authorizeAutomation(
    input: Pick<AutomationCommentInput, 'organizationId' | 'taskKey' | 'ruleAuthorUserId'>,
  ): Promise<boolean> {
    return this.tasks.authorizeAutomation({
      organizationId: input.organizationId,
      actorUserId: input.ruleAuthorUserId,
      taskKey: input.taskKey,
    });
  }

  /** Rechecks a human author's current task access before replaying a receipt. */
  public async authorizeUser(input: CommentReadInput): Promise<void> {
    const task = await this.tasks.authorizeUser(input);
    if (task.outcome === 'authorized') return;
    if (task.outcome === 'task-trashed') throw new CommentTrashedTaskRefusal(task.details);
    if (task.outcome === 'role-insufficient')
      throw new CommentWriteRefusal(task.outcome, task.role);
    throw new CommentWriteRefusal(task.outcome);
  }

  /** Shares the comment write, task activity and event transaction across author types. */
  private async create(
    input: CreateCommentInput,
    actor: CommentCreated['actor'],
  ): Promise<CreateCommentOutput> {
    return this.unit.write(async (store: CommentWriteStore): Promise<CreateCommentOutput> => {
      const mentions = input.mentions ?? [];
      const recipientIds = [...new Set(mentions.map((mention) => mention.userId.toLowerCase()))];
      const { replyToCommentId } = input;
      const access = actor.type === 'automation' ? { ...input, requireEdit: true } : input;
      const task =
        replyToCommentId === null
          ? await this.tasks.begin(access, recipientIds, true)
          : await this.tasks.begin(access, recipientIds, true, async (taskId) => {
              const reply = await store.comments.find(
                input.organizationId,
                taskId,
                replyToCommentId,
                false,
              );
              return reply?.snapshot.actorType === 'user' ? reply.snapshot.actorId : null;
            });
      if (actor.type === 'automation' && task.outcome !== 'ready')
        throw new CommentWriteRefusal('task-not-found');
      if (task.outcome === 'task-trashed') throw new CommentTrashedTaskRefusal(task.details);
      if (task.outcome === 'role-insufficient')
        throw new CommentWriteRefusal(task.outcome, task.role);
      if (task.outcome !== 'ready') throw new CommentWriteRefusal(task.outcome);
      try {
        validateCommentText(input.body, mentions);
      } catch (error: unknown) {
        if (error instanceof InvalidCommentError) {
          throw new CommentWriteRefusal(error.path === 'mentions' ? 'invalid-mentions' : 'invalid');
        }
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
        task.replyRecipientId === reply.snapshot.actorId.toLowerCase()
          ? { commentId: reply.snapshot.id, userId: task.replyRecipientId }
          : undefined;
      const comment = await store.comments.insert({
        organizationId: input.organizationId,
        taskId: task.taskId,
        actorType: actor.type,
        actorId: actor.id,
        body: input.body,
        mentions,
        replyToCommentId: input.replyToCommentId,
      });
      await this.tasks.record(
        actor.type === 'automation'
          ? { ...input, actor: { type: 'automation', id: actor.id } }
          : input,
        task.version,
        comment.snapshot.id,
        commentExcerpt(input.body),
      );
      await store.events.created({
        organizationId: input.organizationId,
        actor,
        taskKey: input.taskKey,
        taskVersion: task.version,
        spaceId: task.spaceId,
        listId: task.listId,
        commentId: comment.snapshot.id,
        commentVersion: comment.snapshot.version,
        mentionedUserIds: recipientIds,
        watcherIds: task.watcherIds,
        ...(recipient === undefined ? {} : { reply: recipient }),
      });
      return comment;
    });
  }
  // #endregion
}
