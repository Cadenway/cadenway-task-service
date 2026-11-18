import { LookIcon } from '@cadenway/contracts/types/internal/task-service';
import { CreateSpaceInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import { LOOK_ICONS } from './look-icon.value-object.js';

describe('LOOK_ICONS: the icons of a space or a list are those of the contract', () => {
  it('lists the icons of LookIcon', () => {
    expect([...LOOK_ICONS].sort()).toEqual(Object.values(LookIcon).sort());
  });

  it('lists icons the validator of a new space accepts', () => {
    for (const icon of LOOK_ICONS) {
      expect(CreateSpaceInternalBody.shape.icon.safeParse(icon).success).toBe(true);
    }
  });

  it('does not list an icon the validator of a new space refuses', () => {
    expect(CreateSpaceInternalBody.shape.icon.safeParse('sailboat').success).toBe(false);
    expect(LOOK_ICONS).not.toContain('sailboat');
  });
});
