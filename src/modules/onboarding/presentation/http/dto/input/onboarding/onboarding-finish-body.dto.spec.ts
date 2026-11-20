import { describe, expect, it } from 'vitest';

import { OnboardingDraftBody } from './onboarding-draft-body.dto.js';
import { OnboardingFinishBody } from './onboarding-finish-body.dto.js';

describe('onboarding bodies', () => {
  it('accepts the published provisioning request and rejects invalid text', () => {
    const valid = { name: 'Produit', prefix: 'CAD', preset: 'dev' };
    expect(OnboardingFinishBody.schema.safeParse(valid).success).toBe(true);
    expect(OnboardingFinishBody.schema.safeParse({ ...valid, name: 'bad\u0000name' }).success).toBe(
      false,
    );
    expect(OnboardingFinishBody.schema.safeParse({ ...valid, name: 'bad\ud800name' }).success).toBe(
      false,
    );
    expect(OnboardingFinishBody.schema.safeParse({ ...valid, unknown: true }).success).toBe(false);
  });

  it('preserves explicit null and rejects unstorable draft text', () => {
    expect(OnboardingDraftBody.schema.parse({ name: null }).name).toBeNull();
    expect(OnboardingDraftBody.schema.safeParse({ name: 'bad\u0000name' }).success).toBe(false);
  });

  it('reports a blank space name in the draft and provisioning request', () => {
    const draft = OnboardingDraftBody.schema.safeParse({ name: '   ' });
    const finish = OnboardingFinishBody.schema.safeParse({
      name: '   ',
      prefix: 'CAD',
      preset: 'dev',
    });
    for (const result of [draft, finish]) {
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues).toEqual(
          expect.arrayContaining([expect.objectContaining({ path: ['name'], code: 'custom' })]),
        );
    }
  });
});
