import type { z } from 'zod';

/** Rejects text PostgreSQL cannot preserve. */
export function storableOnboarding(body: unknown, context: z.RefinementCtx): void {
  if (typeof body !== 'object' || body === null) return;
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string' && (value.includes('\u0000') || /[\uD800-\uDFFF]/u.test(value))) {
      context.addIssue({ code: 'custom', path: [key], message: 'Invalid text.' });
    }
  }
}
