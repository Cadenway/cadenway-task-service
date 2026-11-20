import { describe, expect, it, vi } from 'vitest';

import type { ApprovalRound } from '../../../domain/aggregates/approval/approval-round.aggregate.js';
import type { ApprovalTaskContext } from '../../models/approval/approval-task-context.model.js';
import type { ApprovalComments } from '../../ports/outbound/comments/approval/approval-comments.port.js';
import type { ApprovalEvents } from '../../ports/outbound/messaging/approval/approval-events.port.js';
import type { ApprovalRepository } from '../../ports/outbound/persistence/approval/approval-repository.port.js';
import type { ApprovalTasks } from '../../ports/outbound/tasks/approval/approval-tasks.port.js';
import { ApprovalOperations } from './approval-operations.service.js';

const actor = { organizationId: 'organization', actorUserId: 'reviewer', taskKey: 'CAD-1' };
const initial: ApprovalTaskContext = {
  ...actor,
  taskId: 'task',
  spaceId: 'space',
  listId: 'list',
  version: 1,
  status: 'todo',
  milestone: false,
  instant: new Date('2026-01-01T00:00:00Z'),
  eligibleReviewerIds: ['reviewer'],
  watcherIds: [],
};

function fixture() {
  let current: ApprovalRound | null = null;
  let context = initial;
  const repository: ApprovalRepository = {
    allocateId: () => Promise.resolve('round'),
    findCurrent: () => Promise.resolve(current),
    replaceCurrent: (round) => {
      current = round;
      return Promise.resolve();
    },
    saveVote: (round) => {
      current = round;
      return Promise.resolve(true);
    },
  };
  const requestedEvent = vi.fn();
  const decidedEvent = vi.fn();
  const createComment = vi.fn();
  const events: ApprovalEvents = { requested: requestedEvent, decided: decidedEvent };
  const comments: ApprovalComments = {
    allocateId: () => Promise.resolve('comment'),
    create: createComment,
  };
  const tasks: ApprovalTasks = {
    read: async (_input, operation) => operation.read(context),
    change: async (_input, operation) => {
      const decision = await operation.decide(context);
      if (decision.changed)
        context = {
          ...context,
          version: context.version + 1,
          status: decision.status ?? context.status,
        };
      return decision.finish(context);
    },
  };
  return {
    operations: new ApprovalOperations(tasks, repository, comments, events),
    events,
    comments,
    tasks,
    decidedEvent,
    createComment,
    setContext: (value: ApprovalTaskContext) => {
      context = value;
    },
  };
}

describe('ApprovalOperations', () => {
  it('requests and approves a round, then withdraws without changing task status', async () => {
    const f = fixture();
    const requested = await f.operations.request({
      ...actor,
      expectedVersions: [1],
      reviewerUserIds: ['reviewer'],
    });
    expect(requested.current?.status).toBe('pending');
    const approved = await f.operations.vote({
      ...actor,
      expectedVersions: [2],
      roundId: 'round',
      vote: { decision: 'approved' },
    });
    expect(approved).toMatchObject({
      taskVersion: 3,
      taskStatus: 'done',
      current: { status: 'approved' },
    });
    expect(
      await f.operations.withdraw({ ...actor, expectedVersions: [3], roundId: 'round' }),
    ).toEqual({ version: 4 });
    const before = f.decidedEvent.mock.calls.length;
    expect(
      await f.operations.withdraw({ ...actor, expectedVersions: [4], roundId: 'round' }),
    ).toEqual({ version: 4 });
    expect(f.decidedEvent).toHaveBeenCalledTimes(before);
    expect((await f.operations.read(actor)).taskStatus).toBe('done');
  });

  it('stores a change request as a comment and includes its identifier in the fact', async () => {
    const f = fixture();
    await f.operations.request({ ...actor, expectedVersions: [1], reviewerUserIds: ['reviewer'] });
    const result = await f.operations.vote({
      ...actor,
      expectedVersions: [2],
      roundId: 'round',
      vote: { decision: 'changes-requested', reason: 'Please revise.' },
    });
    expect(result).toMatchObject({
      taskStatus: 'progress',
      current: { status: 'changes-requested' },
    });
    expect(f.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Please revise.', commentId: 'comment' }),
    );
    expect(f.decidedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'reviewer',
      expect.objectContaining({ decision: 'changes-requested', commentId: 'comment' }),
    );
  });

  it('omits revoked reviewers and refuses their subsequent votes', async () => {
    const f = fixture();
    await f.operations.request({ ...actor, expectedVersions: [1], reviewerUserIds: ['reviewer'] });
    f.setContext({ ...initial, version: 2, eligibleReviewerIds: [] });
    expect((await f.operations.read(actor)).current).toMatchObject({
      status: 'pending',
      reviewers: [],
    });
    await expect(
      f.operations.vote({
        ...actor,
        expectedVersions: [2],
        roundId: 'round',
        vote: { decision: 'approved' },
      }),
    ).rejects.toMatchObject({ reason: 'reviewer-required' });
    expect(f.decidedEvent).not.toHaveBeenCalled();
  });

  it('does not store a comment or vote when the task transition is refused', async () => {
    const f = fixture();
    await f.operations.request({ ...actor, expectedVersions: [1], reviewerUserIds: ['reviewer'] });
    const refusal = new Error('task status refused');
    vi.spyOn(f.tasks, 'change').mockImplementation(async (_input, callbacks) => {
      await callbacks.decide({ ...initial, version: 2 });
      throw refusal;
    });
    await expect(
      f.operations.vote({
        ...actor,
        expectedVersions: [2],
        roundId: 'round',
        vote: { decision: 'changes-requested', reason: 'Please revise.' },
      }),
    ).rejects.toBe(refusal);
    expect(f.createComment).not.toHaveBeenCalled();
    expect(f.decidedEvent).not.toHaveBeenCalled();
  });

  it('refuses approval on milestones and hides any historic round', async () => {
    const f = fixture();
    f.setContext({ ...initial, milestone: true });
    expect((await f.operations.read(actor)).current).toBeNull();
    await expect(
      f.operations.request({ ...actor, expectedVersions: [1], reviewerUserIds: ['reviewer'] }),
    ).rejects.toMatchObject({ reason: 'milestone-unsupported' });
  });
});
