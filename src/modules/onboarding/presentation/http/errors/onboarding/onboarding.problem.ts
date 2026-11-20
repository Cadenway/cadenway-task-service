import { ProblemException } from '@cadenway/nest-common';

import { OnboardingRefusal } from '../../../../application/models/onboarding/onboarding-refusal.model.js';
import { OnboardingPrefixTaken } from '../../../../application/models/onboarding/onboarding-prefix-taken.model.js';

/** Maps onboarding application refusals to the published problem codes. */
export async function answerOnboarding<TResult>(work: () => Promise<TResult>): Promise<TResult> {
  try {
    return await work();
  } catch (error: unknown) {
    if (error instanceof OnboardingPrefixTaken) {
      throw new ProblemException({
        status: 409,
        code: 'space.prefix-taken',
        details: { prefix: error.prefix },
      });
    }
    if (!(error instanceof OnboardingRefusal)) throw error;
    switch (error.reason) {
      case 'user-not-found':
        throw new ProblemException({ status: 404, code: 'user.not-found' });
      case 'organization-not-found':
        throw new ProblemException({ status: 404, code: 'organization.not-found' });
      case 'role-forbidden':
        throw new ProblemException({ status: 403, code: 'organization.role-forbidden' });
      case 'version-mismatch':
        throw new ProblemException({
          status: 412,
          code: 'request.version-mismatch',
          details: { version: error.version },
        });
      case 'wizard-closed':
        throw new ProblemException({ status: 409, code: 'onboarding.wizard-closed' });
      case 'checklist-unavailable':
        throw new ProblemException({ status: 409, code: 'onboarding.checklist-unavailable' });
      case 'invalid-draft':
        throw new ProblemException({ status: 400, code: 'request.invalid' });
    }
  }
}
