import { ProblemException } from '@cadenway/nest-common';

import { SavedViewError } from '../../../../application/models/view/saved-view-error.model.js';
import type { SavedViewFailure } from '../../../../application/models/view/saved-view-error.model.js';

/** Maps refused operations to their published problem codes and statuses. */
function refusal(failure: SavedViewFailure): ProblemException {
  switch (failure.reason) {
    case 'missing-organization':
      return new ProblemException({ status: 404, code: 'organization.not-found' });
    case 'missing-list':
      return new ProblemException({ status: 404, code: 'list.not-found' });
    case 'missing-view':
      return new ProblemException({ status: 404, code: 'saved-view.not-found' });
    case 'role-insufficient':
      return new ProblemException({
        status: 403,
        code: 'access.role-insufficient',
        details: { role: failure.role, requiredRole: 'edit' },
      });
    case 'list-archived':
      return new ProblemException({ status: 409, code: 'saved-view.list-archived' });
    case 'limit-reached':
      return new ProblemException({ status: 422, code: 'saved-view.limit-reached' });
    case 'incomplete-sheet-sort': {
      const field = failure.field ?? 'sheetSort';
      return invalidRequest(
        'body',
        `configuration.presentation.${field}`,
        'invalid_type',
        field === 'sheetSort'
          ? 'A sheet sort requires both column and direction.'
          : 'A custom field sort requires both fieldId and direction.',
      );
    }
    case 'version-mismatch':
      return new ProblemException({
        status: 412,
        code: 'request.version-mismatch',
        details: { version: failure.version },
      });
  }
}

/** Gives the HTTP request issue for an invalid saved-view body or page cursor. */
export function invalidRequest(
  location: 'body' | 'query',
  path: string,
  code: string,
  message: string,
): ProblemException {
  return new ProblemException({
    status: 400,
    code: 'request.invalid',
    detail: 'The request does not match its contract.',
    details: { issues: [{ in: location, path, code, message }] },
  });
}

/** Preserves unexpected failures and maps only known saved-view refusals. */
export async function answerSavedViewRefusals<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (error instanceof SavedViewError) throw refusal(error.failure);
    throw error;
  }
}
