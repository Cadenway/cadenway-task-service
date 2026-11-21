import { ProblemException } from '@cadenway/nest-common';

import { TaskRefusal } from '../../../../application/models/task/task-refusal.model.js';

/** Hides inaccessible targets and their parent scopes behind the contract's uniform 404. */
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
    throw error;
  }
}
