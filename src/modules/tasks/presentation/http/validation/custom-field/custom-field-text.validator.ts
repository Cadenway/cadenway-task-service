import type { z } from 'zod';

/** Rejects malformed Unicode before PostgreSQL can replace it on storage. */
export function refuseMalformedCustomFieldText(
  context: z.RefinementCtx,
  value: string | undefined,
  path: readonly string[],
): void {
  if (value !== undefined && /[\uD800-\uDFFF]/u.test(value)) {
    context.addIssue({
      code: 'custom',
      path: [...path],
      message: 'Expected well-formed Unicode text',
    });
  }
}
