import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  HUGO,
  InMemorySpaces,
  atelierNordMembers,
  spaceState,
} from '../../../spaces.fixture.js';
import { CreateList } from '../../list/create-list/create-list.use-case.js';
import { CreateSpace } from '../create-space/create-space.use-case.js';
import { ProvisionOnboardingSpace } from './provision-onboarding-space.use-case.js';

describe('ProvisionOnboardingSpace', () => {
  it('creates the first preset list at version one and emits ordinary events in order', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()] });
    const members = atelierNordMembers();
    const result = await new CreateSpace(spaces, members).executeForOnboarding(
      {
        organizationId: ATELIER_NORD,
        actorUserId: HUGO,
        name: 'Design',
        prefix: 'DES',
        description: null,
        color: 'violet',
        icon: null,
        visibility: 'organization',
      },
      'Backlog',
    );

    expect(spaces.lists.get(result.firstList.list.id)).toMatchObject({
      name: 'Backlog',
      version: 1,
    });
    expect(spaces.events.map((event) => event.kind)).toEqual(['spaceCreated', 'listCreated']);
  });

  it('classifies a reserved prefix without exposing an internal error type', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()] });
    const members = atelierNordMembers();
    const provision = new ProvisionOnboardingSpace(
      spaces,
      new CreateSpace(spaces, members),
      new CreateList(spaces, members),
    );
    const error: unknown = await provision
      .execute({
        organizationId: ATELIER_NORD,
        actorUserId: HUGO,
        name: 'Design',
        prefix: 'CAD',
        description: null,
        color: 'violet',
        listNames: ['Première liste'],
      })
      .catch((failure: unknown) => failure);

    expect(ProvisionOnboardingSpace.refusalOf(error)).toEqual({
      reason: 'prefix-taken',
      prefix: 'CAD',
    });
  });
});
