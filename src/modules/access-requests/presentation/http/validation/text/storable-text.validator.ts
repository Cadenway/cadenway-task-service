import type { z } from 'zod';

/**
 * Function refuseUnstorableText
 *
 * @description
 * Refuses, with one `request.invalid` issue, a text the generated validator accepts but PostgreSQL
 * cannot store: one holding the character U+0000, which `text` refuses, so that it answers `400`
 * instead of failing the write. The message names the expectation, never the value.
 *
 * @param {z.RefinementCtx} context - The refinement context of the body schema.
 * @param {string | null | undefined} text - The text, absent or `null` for none.
 * @param {readonly string[]} path - Where the text sits in the body.
 */
export function refuseUnstorableText(
  context: z.RefinementCtx,
  text: string | null | undefined,
  path: readonly string[],
): void {
  if (typeof text === 'string' && text.includes('\u0000')) {
    context.addIssue({
      code: 'custom',
      path: [...path],
      message: 'Expected a text without the character U+0000',
    });
  }
}
