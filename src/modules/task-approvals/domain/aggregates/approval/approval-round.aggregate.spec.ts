import { describe, expect, it } from 'vitest';

import { ApprovalRound } from './approval-round.aggregate.js';

const id = '019a7007-8b9c-7d0e-8f1a-2b3c4d5e6fa1';
const organizationId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';
const taskId = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1a02';
const camille = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const ines = '019a5f3c-9e1f-7b2a-8c3d-4e5f6a7b8c31';
const hugo = '019a5f3c-a0b1-7c2d-9e3f-5a6b7c8d9e32';
const commentId = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4ba2';
const requestedAt = new Date('2026-11-08T10:40:00Z');
const decidedAt = new Date('2026-11-08T10:45:00Z');
const editors = new Set([camille, ines, hugo]);
const defaultRequest = { id, organizationId, taskId, requesterUserId: camille, requestedAt };

function request(reviewerUserIds: readonly string[] = [ines, hugo]): ApprovalRound {
  return ApprovalRound.request({ ...defaultRequest, reviewerUserIds }, editors).round;
}

function approve(round: ApprovalRound, reviewerUserId: string, eligibleReviewerIds = editors) {
  return round.castVote({
    reviewerUserId,
    eligibleReviewerIds,
    decidedAt,
    vote: { decision: 'approved' },
  });
}

describe('ApprovalRound', () => {
  it('starts with waiting reviewers in submitted order, including a requester who was designated', () => {
    const { round, event } = ApprovalRound.request(
      { ...defaultRequest, reviewerUserIds: [hugo, camille, ines] },
      editors,
    );

    expect(round.view(editors)).toEqual({
      roundId: id,
      requesterUserId: camille,
      requestedAt,
      status: 'pending',
      reviewers: [hugo, camille, ines].map((reviewerUserId) => ({
        reviewerUserId,
        decision: null,
        decidedAt: null,
        commentId: null,
      })),
    });
    expect(event).toEqual({
      kind: 'approval-requested',
      roundId: id,
      reviewerUserIds: [hugo, camille, ines],
    });
  });

  it('requires one to twenty distinct eligible editors', () => {
    const twenty = Array.from(
      { length: 20 },
      (_, index) => `019a5f3c-a0b1-7c2d-9e3f-5a6b7c8d9e${index.toString().padStart(2, '0')}`,
    );
    const more = [...twenty, ines];

    expect(
      ApprovalRound.request({ ...defaultRequest, reviewerUserIds: twenty }, new Set(more)).round
        .snapshot.reviewers,
    ).toHaveLength(20);
    for (const reviewerUserIds of [[], [ines, ines], [ines, ines.toUpperCase()], more]) {
      expect(() =>
        ApprovalRound.request({ ...defaultRequest, reviewerUserIds }, new Set(more)),
      ).toThrow(expect.objectContaining({ reason: 'reviewer-invalid' }));
    }
    expect(() =>
      ApprovalRound.request({ ...defaultRequest, reviewerUserIds: [hugo] }, new Set([camille])),
    ).toThrow(expect.objectContaining({ reason: 'reviewer-invalid' }));
  });

  it('moves to done only when the last eligible reviewer approves', () => {
    const round = request();
    const first = approve(round, ines);
    const second = approve(first.round, hugo);

    expect(first.taskStatus).toBeNull();
    expect(first.round.view(editors).status).toBe('pending');
    expect(second.taskStatus).toBe('done');
    expect(second.round.view(editors).status).toBe('approved');
    expect(second.event).toEqual({
      kind: 'approval-decided',
      roundId: id,
      requesterUserId: camille,
      reviewerUserId: hugo,
      decision: 'approved',
      commentId: null,
    });
    expect(round.view(editors).reviewers.every(({ decision }) => decision === null)).toBe(true);
  });

  it('lets the requester approve their own designated round with a canonical account ID', () => {
    const round = request([camille.toUpperCase()]);
    const approval = approve(round, camille.toUpperCase());

    expect(approval.taskStatus).toBe('done');
    expect(approval.event.reviewerUserId).toBe(camille);
  });

  it('omits reviewers without current edit access while keeping their recorded vote', () => {
    const first = approve(request(), ines).round;
    const eligible = new Set([hugo]);
    const second = approve(first, hugo, eligible);

    expect(first.view(new Set([ines])).status).toBe('approved');
    expect(first.view(new Set()).status).toBe('pending');
    expect(first.view(new Set()).reviewers).toEqual([]);
    expect(first.view(eligible).reviewers.map(({ reviewerUserId }) => reviewerUserId)).toEqual([
      hugo,
    ]);
    expect(second.taskStatus).toBe('done');
    expect(second.round.view(editors).reviewers.map(({ decision }) => decision)).toEqual([
      'approved',
      'approved',
    ]);
  });

  it('refuses an undesignated editor, a revoked editor and a second vote without withdrawal', () => {
    const round = request();
    const voted = approve(round, ines).round;

    expect(() => approve(round, camille)).toThrow(
      expect.objectContaining({ reason: 'reviewer-required' }),
    );
    expect(() => approve(round, ines, new Set([hugo]))).toThrow(
      expect.objectContaining({ reason: 'reviewer-required' }),
    );
    expect(() => approve(voted, ines)).toThrow(
      expect.objectContaining({ reason: 'vote-already-recorded' }),
    );
    expect(() => voted.withdrawVote(ines, new Set([hugo]))).toThrow(
      expect.objectContaining({ reason: 'reviewer-required' }),
    );
  });

  it('links the comment and gives a change request precedence over waiting or approved votes', () => {
    const change = request().castVote({
      reviewerUserId: ines,
      eligibleReviewerIds: editors,
      decidedAt,
      vote: { decision: 'changes-requested', reason: 'Merci de vérifier le parcours.', commentId },
    });

    expect(change.taskStatus).toBe('progress');
    expect(change.round.view(editors).status).toBe('changes-requested');
    expect(change.round.view(editors).reviewers[0]).toEqual({
      reviewerUserId: ines,
      decision: 'changes-requested',
      decidedAt,
      commentId,
    });
    expect(change.event).toMatchObject({ decision: 'changes-requested', commentId });
    expect(change.event).not.toHaveProperty('reason');
    const approval = approve(change.round, hugo);
    expect(approval.taskStatus).toBeNull();
    expect(approval.round.view(editors).status).toBe('changes-requested');
    expect(approval.round.view(new Set([hugo])).status).toBe('approved');
  });

  it('requires a valid reason and comment link before recording a change request', () => {
    const round = request();
    const cast = { reviewerUserId: ines, eligibleReviewerIds: editors, decidedAt };

    expect(() =>
      round.castVote({
        ...cast,
        vote: { decision: 'changes-requested', reason: '   ', commentId },
      }),
    ).toThrow(expect.objectContaining({ reason: 'invalid-reason' }));
    expect(() =>
      round.castVote({
        ...cast,
        vote: {
          decision: 'changes-requested',
          reason: 'Merci de vérifier le parcours.',
          commentId: '',
        },
      }),
    ).toThrow(expect.objectContaining({ reason: 'invalid-state' }));
    expect(round.view(editors).status).toBe('pending');
  });

  it('withdraws a vote once and permits a new vote, with no fact on a no-op', () => {
    const original = approve(request(), ines).round;
    expect(original.withdrawVote(hugo, editors)).toBeNull();
    const withdrawal = original.withdrawVote(ines, editors);

    expect(withdrawal?.round.view(editors).status).toBe('pending');
    expect(withdrawal?.event).toMatchObject({ decision: 'withdrawn', commentId: null });
    expect(withdrawal?.round.withdrawVote(ines, editors)).toBeNull();
    expect(withdrawal === null ? null : approve(withdrawal.round, ines).event.decision).toBe(
      'approved',
    );
  });

  it('keeps earlier votes when a fresh round with the same reviewers is opened', () => {
    const original = approve(request(), ines).round;
    const replacement = ApprovalRound.request(
      {
        ...defaultRequest,
        id: '019a7007-8b9c-7d0e-8f1a-2b3c4d5e6fa2',
        requesterUserId: hugo,
        requestedAt: decidedAt,
        reviewerUserIds: [ines, hugo],
      },
      editors,
    ).round;

    expect(original.view(editors).reviewers[0]?.decision).toBe('approved');
    expect(replacement.view(editors).roundId).not.toBe(id);
    expect(replacement.view(editors).reviewers[0]?.decision).toBeNull();
  });

  it('restores a stored vote and refuses a round with duplicate reviewers', () => {
    const round = approve(request(), ines).round;
    expect(ApprovalRound.restore(round.snapshot).view(editors)).toEqual(round.view(editors));
    expect(() =>
      ApprovalRound.restore({
        ...round.snapshot,
        reviewers: [
          { reviewerUserId: ines, vote: null },
          { reviewerUserId: ines, vote: null },
        ],
      }),
    ).toThrow(expect.objectContaining({ reason: 'invalid-state' }));
  });
});
