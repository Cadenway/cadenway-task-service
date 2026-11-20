import { ProblemException } from '@cadenway/nest-common';

import { TaskTemplateRefusal } from '../../../../application/models/template/task-template-refusal.model.js';

/** Maps only known library refusals to the contract's problem response. */
export async function answerTaskTemplateRefusal<TResult>(
  work: () => Promise<TResult>,
): Promise<TResult> {
  try {
    return await work();
  } catch (error: unknown) {
    if (error instanceof TaskTemplateRefusal) {
      throw new ProblemException({
        status: error.status,
        code: error.code,
        ...(error.details === undefined ? {} : { details: error.details }),
      });
    }
    throw error;
  }
}
