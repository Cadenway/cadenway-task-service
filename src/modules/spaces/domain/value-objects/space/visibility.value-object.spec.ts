import { Visibility as ContractVisibility } from '@cadenway/contracts/types/internal/task-service';
import { CreateSpaceInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import { Space } from '../../aggregates/space/space.aggregate.js';
import { InvalidSpaceError } from '../../errors/space/invalid-space.error.js';
import { ATELIER_NORD, CAMILLE } from '../../spaces.fixture.js';
import type { NewSpace } from './new-space.value-object.js';
import type { Visibility } from './visibility.value-object.js';

/**
 * Builds the creation of the space "Produit" with a visibility.
 *
 * @param visibility - The visibility.
 * @returns The new space.
 */
function newSpace(visibility: Visibility): NewSpace {
  return {
    organizationId: ATELIER_NORD,
    ownerUserId: CAMILLE,
    name: 'Produit',
    prefix: 'CAD',
    description: null,
    icon: 'rocket',
    color: 'violet',
    visibility,
  };
}

describe('Visibility: a space is seen by the organization or is private', () => {
  it('lists exactly the two visibilities of the contract', () => {
    expect(Object.values(ContractVisibility).sort()).toEqual(['organization', 'private']);
  });

  it.each(Object.values(ContractVisibility))(
    'creates a space with the visibility %s of the contract',
    (visibility: Visibility) => {
      expect(CreateSpaceInternalBody.shape.visibility.safeParse(visibility).success).toBe(true);
      expect(Space.create(newSpace(visibility)).visibility).toBe(visibility);
    },
  );

  it('refuses a visibility the validator of a new space refuses', () => {
    expect(CreateSpaceInternalBody.shape.visibility.safeParse('public').success).toBe(false);
    expect(() => Space.create(newSpace('public' as Visibility))).toThrow(InvalidSpaceError);
  });
});
