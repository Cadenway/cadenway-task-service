import { describe, expect, it } from 'vitest';

import { SpaceRefusal } from './space-refusal.model.js';

describe('SpaceRefusal: a refusal carries the reason the presentation maps to a stable code', () => {
  it('keeps the reason and its details', () => {
    const refusal = new SpaceRefusal({ reason: 'prefix-taken', prefix: 'CAD' });

    expect(refusal.refusal).toEqual({ reason: 'prefix-taken', prefix: 'CAD' });
    expect(refusal).toBeInstanceOf(Error);
  });

  it('is named after itself and says the reason in its message', () => {
    const refusal = new SpaceRefusal({ reason: 'space-not-found' });

    expect(refusal.name).toBe('SpaceRefusal');
    expect(refusal.message).toContain('space-not-found');
  });
});
