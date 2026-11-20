import { ProblemException } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import { OnboardingRefusal } from '../../../../application/models/onboarding/onboarding-refusal.model.js';
import { answerOnboarding } from './onboarding.problem.js';

describe('answerOnboarding', () => {
  it.each([
    ['user-not-found', 404, 'user.not-found'],
    ['organization-not-found', 404, 'organization.not-found'],
    ['role-forbidden', 403, 'organization.role-forbidden'],
    ['wizard-closed', 409, 'onboarding.wizard-closed'],
    ['checklist-unavailable', 409, 'onboarding.checklist-unavailable'],
    ['version-mismatch', 412, 'request.version-mismatch'],
  ] as const)('maps %s to its contract problem', async (reason, status, code) => {
    const error: unknown = await answerOnboarding(() =>
      Promise.reject(new OnboardingRefusal(reason, 4)),
    ).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(ProblemException);
    if (!(error instanceof ProblemException)) return;
    expect(error.problem.status).toBe(status);
    expect(error.problem.code).toBe(code);
    if (reason === 'version-mismatch') expect(error.problem.details).toEqual({ version: 4 });
  });

  it('preserves unrelated failures', async () => {
    const failure = new Error('unavailable');
    await expect(answerOnboarding(() => Promise.reject(failure))).rejects.toBe(failure);
  });
});
