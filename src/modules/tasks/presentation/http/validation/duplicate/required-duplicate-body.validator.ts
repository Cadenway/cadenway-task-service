import { ProblemException } from '@cadenway/nest-common';
import type { Request } from 'express';

/**
 * Refuses an absent or non-JSON body before an empty-object duplication command.
 * The JSON parser converts a declared zero-byte body to the same object as a literal `{}`.
 */
export function requireDuplicateBody(request: Request): void {
  const length = request.headers['content-length'];
  if (
    !request.is('application/json') ||
    Number(length) === 0 ||
    (length === undefined && !request.readableDidRead)
  ) {
    throw new ProblemException({
      status: 400,
      code: 'request.invalid',
      details: {
        issues: [{ in: 'body', path: '', code: 'required', message: 'Expected a JSON body.' }],
      },
    });
  }
}
