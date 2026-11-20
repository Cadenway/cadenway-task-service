import {
  APPROVAL_DECIDED_V1,
  APPROVAL_REQUESTED_V1,
  eventSchemas,
} from '@cadenway/contracts/events/task-service';
import type { DatabaseSchema, TransactionScope } from '@cadenway/nest-common/database';
import type { OutboxWriter } from '@cadenway/nest-messaging/outbox';
import { describe, expect, it, vi } from 'vitest';

import type { ApprovalTaskContext } from '../../../../application/models/approval/approval-task-context.model.js';
import type { ApprovalDecided } from '../../../../domain/events/approval/approval-decided.event.js';
import type { ApprovalRequested } from '../../../../domain/events/approval/approval-requested.event.js';
import { OutboxApprovalEvents } from './outbox-approval-events.adapter.js';

const organizationId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';
const requesterUserId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const reviewerUserId = '019a5f3c-9e1f-7b2a-8c3d-4e5f6a7b8c31';
const roundId = '019a7007-8b9c-7d0e-8f1a-2b3c4d5e6fa1';
const commentId = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01';
const eventEnvelope = {
  id: '019a7005-6f7a-7b8c-9d0e-1f2a3b4c5da1',
  occurredAt: '2026-11-08T10:45:00Z',
};

const task: ApprovalTaskContext = {
  organizationId,
  taskId: '019a7004-5e6f-7a8b-9c0d-1e2f3a4b5c01',
  taskKey: 'CAD-482',
  spaceId: '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01',
  listId: '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f12',
  version: 15,
  status: 'progress',
  milestone: false,
  instant: new Date(eventEnvelope.occurredAt),
  eligibleReviewerIds: [requesterUserId, reviewerUserId],
  watcherIds: [requesterUserId],
};

const request: ApprovalRequested = {
  kind: 'approval-requested',
  roundId,
  reviewerUserIds: [reviewerUserId, requesterUserId],
};

const decisionContext = {
  kind: 'approval-decided',
  roundId,
  requesterUserId,
  reviewerUserId,
} as const;
const approved: ApprovalDecided = { ...decisionContext, decision: 'approved', commentId: null };
const decisions: readonly ApprovalDecided[] = [
  approved,
  { ...decisionContext, decision: 'changes-requested', commentId },
  { ...decisionContext, decision: 'withdrawn', commentId: null },
];

function fixture(
  scope: Pick<TransactionScope<DatabaseSchema>, 'kind' | 'organizationId'> = {
    kind: 'tenant',
    organizationId,
  },
) {
  const transaction = scope as TransactionScope<DatabaseSchema>;
  const append = vi.fn<OutboxWriter['append']>().mockResolvedValue(eventEnvelope);
  return { events: new OutboxApprovalEvents(transaction, { append }), transaction, append };
}

describe('approval outbox', () => {
  it('appends the contract-valid requested fact in the supplied transaction', async () => {
    const { events, transaction, append } = fixture();

    await events.requested(task, requesterUserId, request);

    const payload = {
      organizationId,
      actor: { type: 'user', id: requesterUserId },
      version: task.version,
      key: task.taskKey,
      spaceId: task.spaceId,
      listId: task.listId,
      roundId,
      reviewerUserIds: [reviewerUserId, requesterUserId],
    };
    expect(append).toHaveBeenCalledExactlyOnceWith(
      transaction,
      eventSchemas,
      APPROVAL_REQUESTED_V1,
      payload,
    );
    expect(
      eventSchemas[APPROVAL_REQUESTED_V1].safeParse({ ...eventEnvelope, ...payload }).success,
    ).toBe(true);
  });

  it.each(decisions)(
    'appends the contract-valid $decision decision with IDs only',
    async (decision) => {
      const { events, transaction, append } = fixture();

      await events.decided(task, reviewerUserId, decision);

      const payload = {
        organizationId,
        actor: { type: 'user', id: reviewerUserId },
        version: task.version,
        key: task.taskKey,
        spaceId: task.spaceId,
        listId: task.listId,
        roundId,
        requesterUserId,
        decision: decision.decision,
        commentId: decision.commentId,
      };
      expect(append).toHaveBeenCalledExactlyOnceWith(
        transaction,
        eventSchemas,
        APPROVAL_DECIDED_V1,
        payload,
      );
      expect(
        eventSchemas[APPROVAL_DECIDED_V1].safeParse({ ...eventEnvelope, ...payload }).success,
      ).toBe(true);
    },
  );

  it.each([
    { kind: 'system', organizationId: null },
    { kind: 'tenant', organizationId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b21' },
  ] as const)('rejects approval facts outside the owning tenant transaction', async (scope) => {
    const { events, append } = fixture(scope);

    await expect(events.requested(task, requesterUserId, request)).rejects.toThrow(
      /tenant transaction/,
    );
    await expect(events.decided(task, reviewerUserId, approved)).rejects.toThrow(
      /tenant transaction/,
    );
    expect(append).not.toHaveBeenCalled();
  });

  it('rejects a decision whose reviewer is different from the verified actor', async () => {
    const { events, append } = fixture();

    await expect(events.decided(task, requesterUserId, approved)).rejects.toThrow(
      /match its actor/,
    );
    expect(append).not.toHaveBeenCalled();
  });
});
