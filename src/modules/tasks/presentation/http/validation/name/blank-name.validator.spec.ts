import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { refuseBlankName } from './blank-name.validator.js';

/** A schema that checks the name of a body, to see the issues of the validator alone. */
const body = z
  .object({ name: z.string().nullish() })
  .superRefine((value: { name?: string | null }, context) => {
    refuseBlankName(context, ['name'], value.name);
  });

describe('refuseBlankName', () => {
  it.each(['', '   ', ' \t ', '\n'])('refuses the name %j made only of spaces', (name: string) => {
    const result = body.safeParse({ name });

    expect(result.success).toBe(name.trim() !== '');
  });

  it('names the member in one issue and never quotes the value', () => {
    const result = body.safeParse({ name: '   ' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([['name']]);
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        'Expected a name with a character other than a space',
      ]);
    }
  });

  it('words the issue for the subject it is given, at the index of an array member', () => {
    const labels = z.array(z.string()).superRefine((value: string[], context) => {
      value.forEach((label: string, index: number): void => {
        refuseBlankName(context, [index], label, 'a label');
      });
    });
    const result = labels.safeParse(['ok', ' ']);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([[1]]);
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        'Expected a label with a character other than a space',
      ]);
    }
  });

  it('leaves a name with a character, a null and an absent name to the schema', () => {
    expect(body.safeParse({ name: ' Relire ' }).success).toBe(true);
    expect(body.safeParse({ name: null }).success).toBe(true);
    expect(body.safeParse({}).success).toBe(true);
  });
});
