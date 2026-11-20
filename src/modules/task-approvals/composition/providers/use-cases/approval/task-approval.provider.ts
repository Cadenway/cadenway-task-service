import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import { OutboxWriter } from '@cadenway/nest-messaging/outbox';
import type { FactoryProvider } from '@nestjs/common';

import { AllocateApprovalCommentId } from '../../../../../task-comments/public/comment/allocate-approval-comment-id.js';
import { CreateApprovalComment } from '../../../../../task-comments/public/comment/create-approval-comment.js';
import { ChangeTaskApproval } from '../../../../../tasks/public/approval/change-task-approval.js';
import { ReadTaskApproval } from '../../../../../tasks/public/approval/read-task-approval.js';
import { ApprovalTaskRefusal } from '../../../../application/models/approval/approval-task-refusal.model.js';
import { ApprovalOperations } from '../../../../application/services/approval/approval-operations.service.js';
import { RequestTaskApproval } from '../../../../application/use-cases/commands/approval/request-task-approval/request-task-approval.use-case.js';
import { VoteOnTaskApproval } from '../../../../application/use-cases/commands/approval/vote-on-task-approval/vote-on-task-approval.use-case.js';
import { WithdrawTaskApprovalVote } from '../../../../application/use-cases/commands/approval/withdraw-task-approval-vote/withdraw-task-approval-vote.use-case.js';
import { GetTaskApproval } from '../../../../application/use-cases/queries/approval/get-task-approval/get-task-approval.use-case.js';
import { OutboxApprovalEvents } from '../../../../infrastructure/messaging/outbox/approval/outbox-approval-events.adapter.js';
import { DrizzleApprovalRepository } from '../../../../infrastructure/persistence/drizzle/repositories/approval/drizzle-approval.repository.js';

/** Translates a task-owned refusal without coupling approval application code to tasks. */
async function answerTaskRefusal<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    const refusal = ChangeTaskApproval.taskRefusalOf(error);
    if (refusal === null) throw error;
    throw new ApprovalTaskRefusal(refusal.reason, refusal.details);
  }
}

const useCases = [
  GetTaskApproval,
  RequestTaskApproval,
  VoteOnTaskApproval,
  WithdrawTaskApprovalVote,
] as const;

/** Binds approval writes and outbox calls to the task's tenant transaction. */
export const taskApprovalProviders: readonly FactoryProvider[] = [
  {
    provide: ApprovalOperations,
    inject: [
      ReadTaskApproval,
      ChangeTaskApproval,
      AllocateApprovalCommentId,
      CreateApprovalComment,
      TenantTransactionRunner,
      OutboxWriter,
    ],
    useFactory: (
      read: ReadTaskApproval,
      change: ChangeTaskApproval,
      allocateComment: AllocateApprovalCommentId,
      createComment: CreateApprovalComment,
      runner: TenantTransactionRunner,
      outbox: OutboxWriter,
    ): ApprovalOperations => {
      const withRepository = <T>(
        work: (repository: DrizzleApprovalRepository) => Promise<T>,
      ): Promise<T> => runner.run((tx) => work(new DrizzleApprovalRepository(tx.db)));
      return new ApprovalOperations(
        {
          read: (input, operation) => answerTaskRefusal(() => read.execute(input, operation)),
          change: (input, operation) => answerTaskRefusal(() => change.execute(input, operation)),
        },
        {
          allocateId: () => withRepository((repository) => repository.allocateId()),
          findCurrent: (organizationId, taskId) =>
            withRepository((repository) => repository.findCurrent(organizationId, taskId)),
          replaceCurrent: (round, closedAt) =>
            withRepository((repository) => repository.replaceCurrent(round, closedAt)),
          saveVote: (round, reviewerUserId) =>
            withRepository((repository) => repository.saveVote(round, reviewerUserId)),
        },
        {
          allocateId: () => allocateComment.execute(),
          create: ({ context, commentId, authorUserId, body }) =>
            createComment.execute({
              organizationId: context.organizationId,
              taskId: context.taskId,
              taskKey: context.taskKey,
              taskVersion: context.version,
              spaceId: context.spaceId,
              listId: context.listId,
              watcherIds: context.watcherIds,
              commentId,
              actorUserId: authorUserId,
              body,
            }),
        },
        {
          requested: (context, actorUserId, event) =>
            runner.run((tx) =>
              new OutboxApprovalEvents(tx, outbox).requested(context, actorUserId, event),
            ),
          decided: (context, actorUserId, event) =>
            runner.run((tx) =>
              new OutboxApprovalEvents(tx, outbox).decided(context, actorUserId, event),
            ),
        },
      );
    },
  },
  ...useCases.map((UseCase) => ({
    provide: UseCase,
    inject: [ApprovalOperations],
    useFactory: (operations: ApprovalOperations) => new UseCase(operations),
  })),
];
