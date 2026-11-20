import { assertVersionMatch, parseIfMatch } from '@cadenway/nest-common';

/** Reads an optional strong goal version condition. */
export function goalExpectedVersions(value: string | undefined): readonly number[] | null {
  const condition = parseIfMatch(value);
  if (condition === undefined) {
    assertVersionMatch(condition, 0, { required: false });
    return null;
  }
  return condition === '*' ? null : condition;
}
