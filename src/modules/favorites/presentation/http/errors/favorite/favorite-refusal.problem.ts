import { ProblemException } from '@cadenway/nest-common';

import { FavoriteRefusal } from '../../../../application/models/favorite/favorite-refusal.model.js';

/** Maps explicit favorites refusals to the status and code of the internal contract. */
export async function answerFavoriteRefusals<TResult>(
  work: () => Promise<TResult>,
): Promise<TResult> {
  try {
    return await work();
  } catch (error: unknown) {
    if (!(error instanceof FavoriteRefusal)) {
      throw error;
    }
    switch (error.reason) {
      case 'organization-not-found':
        throw new ProblemException({ status: 404, code: 'organization.not-found' });
      case 'favorite-not-found':
        throw new ProblemException({ status: 404, code: 'favorite.not-found' });
      case 'target-not-found':
        throw new ProblemException({ status: 404, code: 'favorite.target-not-found' });
      case 'already-exists':
        throw new ProblemException({ status: 409, code: 'favorite.already-exists' });
      case 'limit-reached':
        throw new ProblemException({ status: 422, code: 'favorite.limit-reached' });
      case 'version-mismatch':
        throw new ProblemException({
          status: 412,
          code: 'request.version-mismatch',
          details: { version: error.version },
        });
    }
  }
}
