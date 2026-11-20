import type { z } from 'zod';

/** Refuses the NUL and unpaired surrogates that cannot round-trip through PostgreSQL text/JSONB. */
export function requirePostgresText(
  context: z.RefinementCtx,
  value: string | undefined,
  path: (string | number)[],
): void {
  if (value !== undefined && (value.includes('\u0000') || /[\uD800-\uDFFF]/u.test(value))) {
    context.addIssue({
      code: 'custom',
      path,
      message: 'Expected valid Unicode text without U+0000.',
    });
  }
}

/** Checks labels, the freeform strings stored inside the configuration document. */
export function checkLabels(context: z.RefinementCtx, labels: string[] | null | undefined): void {
  labels?.forEach((label, index) => {
    requirePostgresText(context, label, ['configuration', 'filters', 'label', index]);
  });
}
