import { ProblemException } from '@cadenway/nest-common';

import { GoalError } from '../../../../application/models/goal/goal-error.model.js';

/** Maps goal refusals to the installed internal contract. */
export async function answerGoal<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (error instanceof GoalError) {
      switch (error.failure.reason) {
        case 'missing-organization':
          throw new ProblemException({ status: 404, code: 'organization.not-found' });
        case 'missing-goal':
          throw new ProblemException({ status: 404, code: 'goal.not-found' });
        case 'missing-space':
          throw new ProblemException({ status: 404, code: 'space.not-found' });
        case 'missing-result':
          throw new ProblemException({ status: 404, code: 'goal.result-not-found' });
        case 'organization-role-forbidden':
          throw new ProblemException({ status: 403, code: 'organization.role-forbidden' });
        case 'role-insufficient':
          throw new ProblemException({
            status: 403,
            code: 'access.role-insufficient',
            details: { role: error.failure.role, requiredRole: 'edit' },
          });
        case 'version-mismatch':
          throw new ProblemException({
            status: 412,
            code: 'request.version-mismatch',
            details: { version: error.failure.version },
          });
        case 'owner-ineligible':
          throw new ProblemException({ status: 422, code: 'goal.owner-ineligible' });
        case 'result-target-invalid':
          throw new ProblemException({ status: 422, code: 'goal.result-target-invalid' });

        case 'due-date-outside-quarter':
          throw new ProblemException({ status: 422, code: 'goal.due-date-outside-quarter' });
        case 'result-limit-reached':
          throw new ProblemException({ status: 422, code: 'goal.result-limit-reached' });
        case 'result-patch-invalid':
          throw new ProblemException({ status: 422, code: 'goal.result-patch-invalid' });
        case 'result-not-found':
          throw new ProblemException({ status: 404, code: 'goal.result-not-found' });
        case 'invalid-goal':
        case 'invalid-quarter':
        case 'invalid-date':
        case 'invalid-result':
          throw new ProblemException({
            status: 400,
            code: 'request.invalid',
            details: {
              issues: [
                {
                  in: 'body',
                  path: '',
                  code: 'invalid',
                  message: 'The request does not match its contract.',
                },
              ],
            },
          });
      }
    }
    throw error;
  }
}
