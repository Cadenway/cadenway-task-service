import { ProblemException } from '@cadenway/nest-common';

import { TaskRefusal } from '../../../../application/models/task/task-refusal.model.js';

/** Hides inaccessible targets and converts unexpected action failures to the contract's 503. */
export async function answerGitTaskRefusals<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (
      error instanceof TaskRefusal &&
      [
        'organization-not-found',
        'task-not-found',
        'list-not-found',
        'space-not-found',
        'role-insufficient',
        'task-archived',
        'task-trashed',
      ].includes(error.refusal.reason)
    ) {
      throw new ProblemException({ status: 404, code: 'task.not-found' });
    }
    throw new ProblemException({ status: 503, code: 'task.action-unavailable' });
  }
}
