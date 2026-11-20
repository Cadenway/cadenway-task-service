import { assertVersionMatch, parseIfMatch } from '@cadenway/nest-common';
import type { IfMatchCondition } from '@cadenway/nest-common';

/**
 * Function toVersionCondition
 *
 * @description
 * The versions an `If-Match` header accepts, for a route that may require the header: `null`
 * without a header (when it is optional) or for `*`, which any existing resource matches. A header
 * that is not a list of entity tags answers `400 request.invalid` with one issue on `If-Match`
 * (`invalid_format`); a header that is required and absent answers `400 request.invalid` with one
 * issue `{ in: 'header', path: 'If-Match', code: 'invalid_type' }`. Both are raised by the kit,
 * which words the problems and never quotes the header. `PATCH /internal/v1/tasks/{taskKey}`
 * requires the header when its body has `description` or `descriptionMentions`.
 *
 * @param {string | undefined} header - The `If-Match` header.
 * @param {boolean} required - Whether the request must carry the header.
 * @returns {readonly number[] | null} The accepted versions, or `null` without a condition.
 * @throws {ProblemException} `400 request.invalid` for a malformed header, or an absent one that
 * is required.
 */
export function toVersionCondition(
  header: string | undefined,
  required: boolean,
): readonly number[] | null {
  const condition: IfMatchCondition = parseIfMatch(header);
  if (condition === undefined) {
    // Without a condition the version is never compared: the check only raises the problem of a
    // missing required header.
    assertVersionMatch(condition, 0, { required });
    return null;
  }
  return condition === '*' ? null : condition;
}
