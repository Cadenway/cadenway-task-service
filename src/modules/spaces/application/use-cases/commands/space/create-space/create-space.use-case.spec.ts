import { describe, expect, it } from 'vitest';

import { InvalidSpaceError } from '../../../../../domain/errors/space/invalid-space.error.js';
import {
  ATELIER_NORD,
  HUGO,
  INES,
  InMemorySpaces,
  NADIA,
  PRODUIT,
  STRANGER,
  atelierNordMembers,
  marketingState,
  refusalOf,
  spaceState,
} from '../../../spaces.fixture.js';
import { CreateSpace } from './create-space.use-case.js';
import type { CreateSpaceInput } from './create-space.input.js';

/**
 * Builds the creation of the private space "Design" by Hugo Dubois.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function createDesign(overrides: Partial<CreateSpaceInput> = {}): CreateSpaceInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: HUGO,
    name: 'Design',
    prefix: 'DES',
    description: null,
    icon: 'paint',
    color: 'fuchsia',
    visibility: 'private',
    ...overrides,
  };
}

/** Atelier Nord with its space "Produit" (CAD). */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({ spaces: [spaceState()] });
}

describe('CreateSpace: a member creates a space and its first list', () => {
  it('creates the space owned by the caller, at version 1, with its next key', async () => {
    const spaces = atelierNord();

    const { space } = await new CreateSpace(spaces, atelierNordMembers()).execute(createDesign());

    expect(space.space).toMatchObject({
      organizationId: ATELIER_NORD,
      name: 'Design',
      prefix: 'DES',
      icon: 'paint',
      color: 'fuchsia',
      visibility: 'private',
      ownerUserId: HUGO,
      version: 1,
    });
    expect(space.nextKey).toBe('DES-1');
    expect(spaces.spaces.get(space.space.id)).toEqual(space.space);
  });

  it('creates the list "Première liste" in the new space, with no sprint', async () => {
    const spaces = atelierNord();

    const { space, firstList } = await new CreateSpace(spaces, atelierNordMembers()).execute(
      createDesign(),
    );

    expect(firstList).toMatchObject({
      organizationId: ATELIER_NORD,
      spaceId: space.space.id,
      name: 'Première liste',
      icon: null,
      color: 'gris',
      sprint: null,
      version: 1,
    });
    expect(spaces.lists.get(firstList.id)).toEqual(firstList);
  });

  it('appends space.created then list.created, by the caller, in the same transaction', async () => {
    const spaces = atelierNord();

    const { space, firstList } = await new CreateSpace(spaces, atelierNordMembers()).execute(
      createDesign(),
    );

    expect(spaces.events).toEqual([
      {
        kind: 'spaceCreated',
        spaceId: space.space.id,
        version: 1,
        actor: { type: 'user', id: HUGO },
      },
      {
        kind: 'listCreated',
        listId: firstList.id,
        spaceId: space.space.id,
        actor: { type: 'user', id: HUGO },
      },
    ]);
    expect(spaces.runs).toBe(1);
  });

  it('numbers the first task of the new space after its prefix', async () => {
    const { space } = await new CreateSpace(atelierNord(), atelierNordMembers()).execute(
      createDesign({ prefix: 'MKT', name: 'Marketing' }),
    );

    expect(space.nextKey).toBe('MKT-1');
  });

  it('lets an admin and the owner of the organization create a space, which they own', async () => {
    const spaces = atelierNord();

    const { space } = await new CreateSpace(spaces, atelierNordMembers()).execute(
      createDesign({ actorUserId: INES, visibility: 'organization' }),
    );

    expect(space.space).toMatchObject({ ownerUserId: INES, visibility: 'organization' });
  });

  it('stores the space the domain normalizes: trimmed name, no empty description', async () => {
    const { space } = await new CreateSpace(atelierNord(), atelierNordMembers()).execute(
      createDesign({ name: '  Design  ', description: '   ' }),
    );

    expect(space.space).toMatchObject({ name: 'Design', description: null });
  });

  it('leaves the other spaces of the organization as they were', async () => {
    const spaces = atelierNord();

    await new CreateSpace(spaces, atelierNordMembers()).execute(createDesign());

    expect(spaces.spaces.get(PRODUIT)).toEqual(spaceState());
    expect(spaces.spaces.size).toBe(2);
  });
});

describe('CreateSpace: a prefix belongs for good to the space that used it', () => {
  it('refuses a prefix another space owns, naming it, and stores and appends nothing', async () => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new CreateSpace(spaces, atelierNordMembers()).execute(createDesign({ prefix: 'CAD' })),
    );

    expect(refusal).toEqual({ reason: 'prefix-taken', prefix: 'CAD' });
    expect([...spaces.spaces.keys()]).toEqual([PRODUIT]);
    expect(spaces.lists.size).toBe(0);
    expect(spaces.events).toEqual([]);
    expect(spaces.prefixOwners.size).toBe(1);
  });

  it('refuses a former prefix of another space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ prefix: 'PRD' })],
      formerPrefixes: [{ prefix: 'CAD', spaceId: PRODUIT }],
    });

    const refusal = await refusalOf(
      new CreateSpace(spaces, atelierNordMembers()).execute(createDesign({ prefix: 'CAD' })),
    );

    expect(refusal).toEqual({ reason: 'prefix-taken', prefix: 'CAD' });
    expect(spaces.spaces.size).toBe(1);
    expect(spaces.events).toEqual([]);
  });

  it('keeps its committed state when a later creation is refused', async () => {
    const spaces = atelierNord();
    const create = new CreateSpace(spaces, atelierNordMembers());
    const { space } = await create.execute(createDesign());

    await refusalOf(create.execute(createDesign({ name: 'Another design' })));

    expect([...spaces.spaces.keys()]).toEqual([PRODUIT, space.space.id]);
    expect(spaces.events.map((event) => event.kind)).toEqual(['spaceCreated', 'listCreated']);
  });

  it('accepts a prefix no space of the organization used', async () => {
    const spaces = new InMemorySpaces({ spaces: [marketingState()] });

    const { space } = await new CreateSpace(spaces, atelierNordMembers()).execute(
      createDesign({ prefix: 'CAD' }),
    );

    expect(space.space.prefix).toBe('CAD');
  });
});

describe('CreateSpace: who creates a space', () => {
  it('refuses a guest with role-forbidden and stores nothing', async () => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new CreateSpace(spaces, atelierNordMembers()).execute(createDesign({ actorUserId: NADIA })),
    );

    expect(refusal).toEqual({ reason: 'role-forbidden' });
    expect(spaces.spaces.size).toBe(1);
    expect(spaces.lists.size).toBe(0);
    expect(spaces.events).toEqual([]);
  });

  it('refuses an account the copy of the members does not know with organization-not-found', async () => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new CreateSpace(spaces, atelierNordMembers()).execute(
        createDesign({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
    expect(spaces.spaces.size).toBe(1);
    expect(spaces.events).toEqual([]);
  });
});

describe('CreateSpace: the domain refuses an invalid space before anything is stored', () => {
  it('rejects a prefix that is not 2 to 5 uppercase letters and stores nothing', async () => {
    const spaces = atelierNord();

    await expect(
      new CreateSpace(spaces, atelierNordMembers()).execute(createDesign({ prefix: 'des' })),
    ).rejects.toThrow(InvalidSpaceError);

    expect(spaces.spaces.size).toBe(1);
    expect(spaces.lists.size).toBe(0);
    expect(spaces.events).toEqual([]);
  });

  it('rejects a name of 81 characters', async () => {
    await expect(
      new CreateSpace(atelierNord(), atelierNordMembers()).execute(
        createDesign({ name: 'a'.repeat(81) }),
      ),
    ).rejects.toThrow(InvalidSpaceError);
  });
});

describe('CreateSpace: the membership of the caller is locked, so a removal cannot slip in', () => {
  it('asks the directory for the role of the caller with the lock', async () => {
    const members = atelierNordMembers();

    await new CreateSpace(atelierNord(), members).execute(createDesign());

    expect(members.roleCalls).toEqual([{ organizationId: ATELIER_NORD, userId: HUGO, lock: true }]);
  });

  it('locks the membership of a guest too, before refusing the creation', async () => {
    const members = atelierNordMembers();

    await refusalOf(
      new CreateSpace(atelierNord(), members).execute(createDesign({ actorUserId: NADIA })),
    );

    expect(members.roleCalls).toEqual([
      { organizationId: ATELIER_NORD, userId: NADIA, lock: true },
    ]);
  });
});
