import type { z } from 'zod';

/**
 * Function refuseBlankName
 *
 * @description
 * The check of a name the generated schema cannot express: "a name made only of spaces is refused
 * with `400 request.invalid`" (`SpaceName`, `ListName`, `SpaceStatusPatch`). It adds one issue on
 * the member when the value is a text with no character other than a space, and leaves every other
 * value, `undefined` and `null` included, to the schema. The message names the expectation and
 * never the value.
 *
 * @param {z.RefinementCtx} context - Where the issue is added.
 * @param {readonly string[]} path - The path of the member in the body.
 * @param {string | null | undefined} value - The name as sent.
 */
export function refuseBlankName(
  context: z.RefinementCtx,
  path: readonly string[],
  value: string | null | undefined,
): void {
  if (typeof value === 'string' && value.trim() === '') {
    context.addIssue({
      code: 'custom',
      path: [...path],
      message: 'Expected a name with a character other than a space',
    });
  }
}
