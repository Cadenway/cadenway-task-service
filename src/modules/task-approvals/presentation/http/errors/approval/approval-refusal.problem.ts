import { ProblemException } from '@cadenway/nest-common';

import { ApprovalRefusal } from '../../../../application/models/approval/approval-refusal.model.js';
import { ApprovalTaskRefusal } from '../../../../application/models/approval/approval-task-refusal.model.js';

/** Maps task-owned refusals to the task-service problem codes. */
function answerTaskRefusal(error: ApprovalTaskRefusal): never {
  const codes = {
    'organization-not-found': [404, 'organization.not-found'],
    'task-not-found': [404, 'task.not-found'],
    'task-trashed': [404, 'task.trashed'],
    'role-insufficient': [403, 'access.role-insufficient'],
    'task-archived': [409, 'task.archived'],
    'version-mismatch': [412, 'request.version-mismatch'],
    'status-hidden': [422, 'task.status-hidden'],
    'recurrence-already-spawned': [409, 'recurrence.already-spawned'],
    'recurrence-date-out-of-range': [422, 'recurrence.date-out-of-range'],
    'subtask-limit-reached': [422, 'task.subtask-limit-reached'],
  } as const;
  const key = error.reason as keyof typeof codes;
  const shape = Object.hasOwn(codes, key) ? codes[key] : undefined;
  if (shape === undefined) throw error;
  throw new ProblemException({
    status: shape[0],
    code: shape[1],
    ...(error.details === undefined || Object.keys(error.details).length === 0
      ? {}
      : { details: error.details }),
  });
}

/** Maps approval refusals without exposing reviewer identities or comment content. */
export async function answerApprovalRefusals<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (error instanceof ApprovalTaskRefusal) answerTaskRefusal(error);
    if (!(error instanceof ApprovalRefusal)) throw error;
    switch (error.reason) {
      case 'round-not-found':
        throw new ProblemException({ status: 404, code: 'approval.round-not-found' });
      case 'reviewer-required':
        throw new ProblemException({ status: 403, code: 'approval.reviewer-required' });
      case 'reviewer-invalid':
        throw new ProblemException({ status: 422, code: 'approval.reviewer-invalid' });
      case 'milestone-unsupported':
        throw new ProblemException({ status: 409, code: 'approval.milestone-unsupported' });
      case 'vote-already-recorded':
        throw new ProblemException({ status: 409, code: 'approval.vote-already-recorded' });
      case 'invalid-reason':
        throw new ProblemException({ status: 400, code: 'request.invalid' });
    }
  }
}
