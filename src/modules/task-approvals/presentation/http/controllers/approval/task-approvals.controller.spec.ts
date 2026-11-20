import { runWithOrganizationContext } from '@cadenway/nest-common';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { RequestTaskApproval } from '../../../../application/use-cases/commands/approval/request-task-approval/request-task-approval.use-case.js';
import type { VoteOnTaskApproval } from '../../../../application/use-cases/commands/approval/vote-on-task-approval/vote-on-task-approval.use-case.js';
import type { WithdrawTaskApprovalVote } from '../../../../application/use-cases/commands/approval/withdraw-task-approval-vote/withdraw-task-approval-vote.use-case.js';
import type { GetTaskApproval } from '../../../../application/use-cases/queries/approval/get-task-approval/get-task-approval.use-case.js';
import { TaskApprovalsController } from './task-approvals.controller.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const actorUserId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const roundId = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01';
const state = {
  taskKey: 'CAD-482',
  taskVersion: 13,
  taskStatus: 'progress',
  current: {
    roundId,
    requesterUserId: actorUserId,
    requestedAt: new Date('2026-11-20T12:00:00.000Z'),
    status: 'pending',
    reviewers: [{ reviewerUserId: actorUserId, decision: null, decidedAt: null, commentId: null }],
  },
};

function asCaller<T>(work: () => Promise<T>): Promise<T> {
  return runWithOrganizationContext(
    { organizationId, actor: { type: 'user', id: actorUserId }, role: null, scopes: [] },
    work,
  );
}

describe('TaskApprovalsController', () => {
  it('maps current state and emits the task ETag', async () => {
    const execute = vi.fn().mockResolvedValue(state);
    const controller = new TaskApprovalsController(
      { execute } as unknown as GetTaskApproval,
      {} as RequestTaskApproval,
      {} as VoteOnTaskApproval,
      {} as WithdrawTaskApprovalVote,
    );
    const setHeader = vi.fn();
    const result = await asCaller(() =>
      controller.get({ taskKey: 'CAD-482' }, { setHeader } as unknown as Response),
    );
    expect(execute).toHaveBeenCalledWith({ organizationId, actorUserId, taskKey: 'CAD-482' });
    expect(setHeader).toHaveBeenCalledWith('ETag', '"13"');
    expect(result.current?.requestedAt).toBe('2026-11-20T12:00:00.000Z');
  });

  it('sends the verified actor, reviewer list and required task version', async () => {
    const execute = vi.fn().mockResolvedValue(state);
    const controller = new TaskApprovalsController(
      {} as GetTaskApproval,
      { execute } as unknown as RequestTaskApproval,
      {} as VoteOnTaskApproval,
      {} as WithdrawTaskApprovalVote,
    );
    const setHeader = vi.fn();
    await asCaller(() =>
      controller.request({ taskKey: 'CAD-482' }, { reviewerUserIds: [actorUserId] }, '"12"', {
        setHeader,
      } as unknown as Response),
    );
    expect(execute).toHaveBeenCalledWith({
      organizationId,
      actorUserId,
      taskKey: 'CAD-482',
      reviewerUserIds: [actorUserId],
      expectedVersions: [12],
    });
    expect(setHeader).toHaveBeenCalledWith('ETag', '"13"');
  });

  it('maps the vote and withdrawal under the same conditional task version', async () => {
    const vote = vi.fn().mockResolvedValue(state);
    const withdraw = vi.fn().mockResolvedValue({ version: 14 });
    const controller = new TaskApprovalsController(
      {} as GetTaskApproval,
      {} as RequestTaskApproval,
      { execute: vote } as unknown as VoteOnTaskApproval,
      { execute: withdraw } as unknown as WithdrawTaskApprovalVote,
    );
    const setHeader = vi.fn();
    const response = { setHeader } as unknown as Response;
    const path = { taskKey: 'CAD-482', roundId: roundId.toUpperCase() };
    await asCaller(() => controller.vote(path, { decision: 'approved' }, '"12"', response));
    await asCaller(() => controller.withdraw(path, '"13"', response));
    expect(vote).toHaveBeenCalledWith({
      organizationId,
      actorUserId,
      taskKey: 'CAD-482',
      roundId,
      expectedVersions: [12],
      vote: { decision: 'approved' },
    });
    expect(withdraw).toHaveBeenCalledWith({
      organizationId,
      actorUserId,
      taskKey: 'CAD-482',
      roundId,
      expectedVersions: [13],
    });
    expect(setHeader).toHaveBeenLastCalledWith('ETag', '"14"');
  });
});
