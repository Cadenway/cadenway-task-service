import { LookColor } from '@cadenway/contracts/types/internal/task-service';
import { CreateSpaceInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import { LOOK_COLORS } from './look-color.value-object.js';

describe('LOOK_COLORS: the colors of a space or a list are those of the contract', () => {
  it('lists the colors of LookColor', () => {
    expect([...LOOK_COLORS].sort()).toEqual(Object.values(LookColor).sort());
  });

  it('lists colors the validator of a new space accepts', () => {
    for (const color of LOOK_COLORS) {
      expect(CreateSpaceInternalBody.shape.color.safeParse(color).success).toBe(true);
    }
  });

  it('does not list a color the validator of a new space refuses', () => {
    expect(CreateSpaceInternalBody.shape.color.safeParse('turquoise').success).toBe(false);
    expect(LOOK_COLORS).not.toContain('turquoise');
  });
});
