import { assertVersionMatch, parseIfMatch } from '@cadenway/nest-common';

/** Reads the optional strong entity-tag condition of an onboarding write. */
export function onboardingVersionCondition(header: string | undefined): readonly number[] | null {
  const condition = parseIfMatch(header);
  if (condition === undefined) {
    assertVersionMatch(condition, 0, { required: false });
    return null;
  }
  return condition === '*' ? null : condition;
}
