import { ProblemException } from '@cadenway/nest-common';

import { TaskRefusal } from '../../../../application/models/task/task-refusal.model.js';

/** Maps Task action failures to the contract without disclosing resource details. */
export async function answerAutomationTaskRefusals<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (error instanceof TaskRefusal) {
      const reason = error.refusal.reason;
      if (reason === 'assignee-invalid' || reason === 'assignee-limit-reached') {
        throw new ProblemException({ status: 422, code: `task.${reason}` });
      }
      if (
        [
          'organization-not-found',
          'task-not-found',
          'list-not-found',
          'space-not-found',
          'role-insufficient',
          'task-archived',
          'task-trashed',
        ].includes(reason)
      ) {
        throw new ProblemException({ status: 404, code: 'task.not-found' });
      }
    }
    throw new ProblemException({ status: 503, code: 'task.action-unavailable' });
  }
}
