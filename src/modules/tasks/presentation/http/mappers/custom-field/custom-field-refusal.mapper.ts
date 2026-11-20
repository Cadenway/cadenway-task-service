import { ProblemException } from '@cadenway/nest-common';
import { CustomFieldRefusal } from '../../../../application/models/custom-field/custom-field-refusal.model.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';

/** Maps the field refusals and delegates shared visibility errors to the task mapper. */
export async function answerCustomFieldRefusals<TResult>(
  work: () => Promise<TResult>,
): Promise<TResult> {
  try {
    return await answerRefusals(work);
  } catch (error: unknown) {
    if (!(error instanceof CustomFieldRefusal)) throw error;
    if (error.reason === 'manage-forbidden')
      throw new ProblemException({ status: 403, code: 'space.manage-forbidden' });
    if (error.reason === 'not-found')
      throw new ProblemException({ status: 404, code: 'custom-field.not-found' });
    if (error.reason === 'version-mismatch') {
      throw new ProblemException({
        status: 412,
        code: 'request.version-mismatch',
        details: { version: error.version },
      });
    }
    if (error.reason === 'definition-invalid') {
      throw new ProblemException({ status: 400, code: 'request.invalid' });
    }
    throw new ProblemException({ status: 422, code: `custom-field.${error.reason}` });
  }
}
