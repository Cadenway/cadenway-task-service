import { ProblemException } from '@cadenway/nest-common';

import { CommentWriteRefusal } from '../../../../application/models/comment/comment-write-refusal.model.js';

/** Maps comment action failures without exposing the task or its placement. */
export async function answerAutomationComment<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (error instanceof CommentWriteRefusal) {
      if (error.reason === 'invalid') {
        throw new ProblemException({
          status: 400,
          code: 'request.invalid',
          details: { issues: [{ in: 'body', path: 'body', code: 'invalid_format' }] },
        });
      }
      throw new ProblemException({ status: 404, code: 'task.not-found' });
    }
    throw new ProblemException({ status: 503, code: 'task.action-unavailable' });
  }
}
