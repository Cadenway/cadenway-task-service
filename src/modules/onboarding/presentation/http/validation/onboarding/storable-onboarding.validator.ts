import type { z } from 'zod';

/** Rejects blank names and text PostgreSQL cannot preserve. */
export function storableOnboarding(body: unknown, context: z.RefinementCtx): void {
  if (typeof body !== 'object' || body === null) return;
  for (const [key, value] of Object.entries(body)) {
    if (key === 'name' && typeof value === 'string' && value.trim() === '') {
      context.addIssue({
        code: 'custom',
        path: [key],
        message: 'Expected a name with a character other than a space',
      });
    }
    if (typeof value === 'string' && (value.includes('\u0000') || /[\uD800-\uDFFF]/u.test(value))) {
      context.addIssue({ code: 'custom', path: [key], message: 'Invalid text.' });
    }
  }
}
