import { ProblemException } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import { ApprovalRefusal } from '../../../../application/models/approval/approval-refusal.model.js';
import { ApprovalTaskRefusal } from '../../../../application/models/approval/approval-task-refusal.model.js';
import { answerApprovalRefusals } from './approval-refusal.problem.js';

describe('answerApprovalRefusals', () => {
  it.each([
    ['round-not-found', 404, 'approval.round-not-found'],
    ['reviewer-required', 403, 'approval.reviewer-required'],
    ['reviewer-invalid', 422, 'approval.reviewer-invalid'],
    ['milestone-unsupported', 409, 'approval.milestone-unsupported'],
    ['vote-already-recorded', 409, 'approval.vote-already-recorded'],
    ['invalid-reason', 400, 'request.invalid'],
  ] as const)('maps %s without details', async (reason, status, code) => {
    const error: unknown = await answerApprovalRefusals(() =>
      Promise.reject(new ApprovalRefusal(reason)),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProblemException);
    if (error instanceof ProblemException) {
      expect(error.problem).toMatchObject({ status, code });
      expect(error.problem.details).toBeUndefined();
    }
  });

  it.each([
    ['task-not-found', 404, 'task.not-found', {}],
    ['role-insufficient', 403, 'access.role-insufficient', { role: 'view', requiredRole: 'edit' }],
    ['task-archived', 409, 'task.archived', { key: 'CAD-1' }],
    ['version-mismatch', 412, 'request.version-mismatch', { version: 13 }],
    ['status-hidden', 422, 'task.status-hidden', { status: 'done' }],
  ] as const)('maps task refusal %s', async (reason, status, code, details) => {
    const error: unknown = await answerApprovalRefusals(() =>
      Promise.reject(new ApprovalTaskRefusal(reason, details)),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProblemException);
    if (error instanceof ProblemException) {
      expect(error.problem).toMatchObject({ status, code });
      expect(error.problem.details).toEqual(
        Object.keys(details).length === 0 ? undefined : details,
      );
    }
  });
});
