import { ProblemException } from '@cadenway/nest-common';

import { CommentTrashedTaskRefusal } from '../../../../application/models/comment/comment-trashed-task-refusal.model.js';
import { CommentWriteRefusal } from '../../../../application/models/comment/comment-write-refusal.model.js';
import { CommentReadRefusal } from '../../../../application/models/comment/comment-read-refusal.model.js';

/** Maps comment read refusals to their contract problem codes. */
export function commentProblem(error: unknown, taskKey: string): unknown {
  if (error instanceof CommentTrashedTaskRefusal) {
    return new ProblemException({
      status: 404,
      code: 'task.trashed',
      details: { ...error.details },
    });
  }
  if (error instanceof CommentWriteRefusal) {
    if (error.reason === 'invalid' || error.reason === 'invalid-mentions') {
      const path = error.reason === 'invalid-mentions' ? 'mentions' : 'body';
      return new ProblemException({
        status: 400,
        code: 'request.invalid',
        details: {
          issues: [
            {
              in: 'body',
              path,
              code: 'invalid_value',
              message: path === 'mentions' ? 'Invalid mention spans.' : 'Invalid comment text.',
            },
          ],
        },
      });
    }
    if (error.reason === 'recipient-invalid')
      return new ProblemException({ status: 422, code: 'mention.recipient-invalid' });
    if (error.reason === 'role-insufficient')
      return new ProblemException({
        status: 403,
        code: 'access.role-insufficient',
        details: { role: error.role, requiredRole: 'comment' },
      });
    if (error.reason === 'author-required')
      return new ProblemException({ status: 403, code: 'comment.author-required' });
    if (error.reason === 'version-mismatch')
      return new ProblemException({
        status: 412,
        code: 'request.version-mismatch',
        details: { version: error.version },
      });
    if (error.reason === 'task-archived')
      return new ProblemException({
        status: 409,
        code: 'task.archived',
        details: { key: taskKey },
      });
    return new ProblemException({
      status: 404,
      code:
        error.reason === 'comment-not-found'
          ? 'comment.not-found'
          : error.reason === 'task-not-found'
            ? 'task.not-found'
            : 'organization.not-found',
    });
  }
  if (!(error instanceof CommentReadRefusal)) return error;
  const code =
    error.reason === 'task-not-found'
      ? 'task.not-found'
      : error.reason === 'organization-not-found'
        ? 'organization.not-found'
        : 'comment.not-found';
  return new ProblemException({ status: 404, code });
}
