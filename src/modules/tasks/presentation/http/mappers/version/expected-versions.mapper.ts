import { parseIfMatch } from '@cadenway/nest-common';
import type { IfMatchCondition } from '@cadenway/nest-common';

/**
 * Function toExpectedVersions
 *
 * @description
 * The versions an `If-Match` header accepts, read with `parseIfMatch` of the kit: `null` without a
 * header or for `*`, which any existing resource matches. A header that is not a list of entity
 * tags answers `400 request.invalid` with one issue on `If-Match` (`in: 'header'`,
 * `invalid_format`), the code the contract declares, raised by the kit itself.
 *
 * @param {string | undefined} header - The `If-Match` header.
 * @returns {readonly number[] | null} The accepted versions, or `null` without a condition.
 * @throws {ProblemException} `400 request.invalid` for a malformed header.
 */
export function toExpectedVersions(header: string | undefined): readonly number[] | null {
  const condition: IfMatchCondition = parseIfMatch(header);
  return condition === undefined || condition === '*' ? null : condition;
}
