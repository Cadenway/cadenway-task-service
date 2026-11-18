import { describe, expect, it } from 'vitest';

import { TaskRefusal } from './task-refusal.model.js';

describe('TaskRefusal: a refusal carries the reason the presentation maps to a stable code', () => {
  it('keeps the reason and its details', () => {
    const refusal = new TaskRefusal({ reason: 'version-mismatch', version: 12 });

    expect(refusal.refusal).toEqual({ reason: 'version-mismatch', version: 12 });
    expect(refusal).toBeInstanceOf(Error);
  });

  it('is named after itself and says the reason in its message', () => {
    const refusal = new TaskRefusal({ reason: 'task-not-found' });

    expect(refusal.name).toBe('TaskRefusal');
    expect(refusal.message).toContain('task-not-found');
  });
});
