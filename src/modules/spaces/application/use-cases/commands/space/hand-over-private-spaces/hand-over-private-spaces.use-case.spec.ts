import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  DESIGN,
  HUGO,
  INES,
  InMemorySpaces,
  MARKETING,
  OTHER_ORGANIZATION,
  PRODUIT,
  atelierNordMembers,
  designState,
  marketingState,
  spaceState,
} from '../../../spaces.fixture.js';
import { HandOverPrivateSpaces } from './hand-over-private-spaces.use-case.js';

/** What the use case records for a space it handed over: the system, not a member, acts. */
const SYSTEM = { type: 'system', id: 'task-service' } as const;

describe('HandOverPrivateSpaces: the owner of the organization takes the private spaces of a leaver', () => {
  it('gives the private space of Hugo Dubois to Camille Martin, at the next version', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState(), designState()] });

    await new HandOverPrivateSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute({
      organizationId: ATELIER_NORD,
      formerOwnerUserId: HUGO,
    });

    expect(spaces.spaces.get(DESIGN)).toEqual(designState({ ownerUserId: CAMILLE, version: 2 }));
  });

  it('appends space.updated for ownerUserId, by the system actor', async () => {
    const spaces = new InMemorySpaces({ spaces: [designState()] });

    await new HandOverPrivateSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute({
      organizationId: ATELIER_NORD,
      formerOwnerUserId: HUGO,
    });

    expect(spaces.events).toEqual([
      {
        kind: 'spaceUpdated',
        spaceId: DESIGN,
        version: 2,
        changed: ['ownerUserId'],
        actor: SYSTEM,
      },
    ]);
  });

  it('hands over every private space of the leaver, with one event each', async () => {
    const second = designState({
      id: '019a7000-0000-7000-8000-000000000004',
      name: 'Recherche',
      prefix: 'RCH',
    });
    const spaces = new InMemorySpaces({ spaces: [designState(), second] });

    await new HandOverPrivateSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute({
      organizationId: ATELIER_NORD,
      formerOwnerUserId: HUGO,
    });

    expect([...spaces.spaces.values()].map((space) => space.ownerUserId)).toEqual([
      CAMILLE,
      CAMILLE,
    ]);
    expect(spaces.events.map((event) => event.kind)).toEqual(['spaceUpdated', 'spaceUpdated']);
  });

  it('keeps the former member as owner of a space of the whole organization', async () => {
    const shared = marketingState({ ownerUserId: HUGO });
    const spaces = new InMemorySpaces({ spaces: [shared, designState()] });

    await new HandOverPrivateSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute({
      organizationId: ATELIER_NORD,
      formerOwnerUserId: HUGO,
    });

    expect(spaces.spaces.get(MARKETING)).toEqual(shared);
    expect(spaces.events).toHaveLength(1);
  });

  it('leaves the private spaces of the other members as they are', async () => {
    const inesPrivate = spaceState({
      id: PRODUIT,
      visibility: 'private',
      ownerUserId: INES,
    });
    const spaces = new InMemorySpaces({ spaces: [inesPrivate, designState()] });

    await new HandOverPrivateSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute({
      organizationId: ATELIER_NORD,
      formerOwnerUserId: HUGO,
    });

    expect(spaces.spaces.get(PRODUIT)).toEqual(inesPrivate);
  });

  it('leaves the private spaces of the same account in another organization as they are', async () => {
    const elsewhere = designState({ organizationId: OTHER_ORGANIZATION });
    const spaces = new InMemorySpaces({ spaces: [elsewhere] });

    await new HandOverPrivateSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute({
      organizationId: ATELIER_NORD,
      formerOwnerUserId: HUGO,
    });

    expect(spaces.spaces.get(DESIGN)).toEqual(elsewhere);
    expect(spaces.events).toEqual([]);
  });

  it('does nothing when the leaver owns no private space', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()] });

    await new HandOverPrivateSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute({
      organizationId: ATELIER_NORD,
      formerOwnerUserId: HUGO,
    });

    expect(spaces.events).toEqual([]);
  });
});

describe('HandOverPrivateSpaces: the same member event can be delivered again', () => {
  it('appends nothing and changes nothing the second time', async () => {
    const spaces = new InMemorySpaces({ spaces: [designState()] });
    const handOver = new HandOverPrivateSpaces(spaces, atelierNordMembers({ removed: [HUGO] }));
    const input = { organizationId: ATELIER_NORD, formerOwnerUserId: HUGO };
    await handOver.execute(input);
    const stored = new Map(spaces.spaces);
    const events = [...spaces.events];

    await handOver.execute(input);

    expect(spaces.spaces).toEqual(stored);
    expect(spaces.events).toEqual(events);
    expect(spaces.spaces.get(DESIGN)?.version).toBe(2);
  });
});

describe('HandOverPrivateSpaces: the owner of the organization must be known', () => {
  it('throws, so the delivery is retried, while the copy does not know the owner', async () => {
    const spaces = new InMemorySpaces({ spaces: [designState()] });

    await expect(
      new HandOverPrivateSpaces(
        spaces,
        atelierNordMembers({ removed: [HUGO], ownerKnown: false }),
      ).execute({
        organizationId: ATELIER_NORD,
        formerOwnerUserId: HUGO,
      }),
    ).rejects.toThrow('The owner of the organization is not known yet.');

    expect(spaces.spaces.get(DESIGN)).toEqual(designState());
    expect(spaces.events).toEqual([]);
  });

  it('touches nothing when the leaver is the owner of the organization', async () => {
    const owned = designState({ ownerUserId: CAMILLE });
    const spaces = new InMemorySpaces({ spaces: [owned] });

    await new HandOverPrivateSpaces(spaces, atelierNordMembers({ removed: [CAMILLE] })).execute({
      organizationId: ATELIER_NORD,
      formerOwnerUserId: CAMILLE,
    });

    expect(spaces.spaces.get(DESIGN)).toEqual(owned);
    expect(spaces.events).toEqual([]);
  });
});

describe('HandOverPrivateSpaces: a member who is still in the organization keeps their spaces', () => {
  it('hands nothing over while the copy still holds a membership of the account', async () => {
    const spaces = new InMemorySpaces({ spaces: [designState()] });

    await new HandOverPrivateSpaces(spaces, atelierNordMembers()).execute({
      organizationId: ATELIER_NORD,
      formerOwnerUserId: HUGO,
    });

    expect(spaces.spaces.get(DESIGN)).toEqual(designState());
    expect(spaces.events).toEqual([]);
  });
});

describe('HandOverPrivateSpaces: the owner of the organization is asked only when there is something to hand over', () => {
  it('resolves without asking for the owner when the leaver has no private space, though it is unknown', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()] });
    const members = atelierNordMembers({ removed: [HUGO], ownerKnown: false });

    await expect(
      new HandOverPrivateSpaces(spaces, members).execute({
        organizationId: ATELIER_NORD,
        formerOwnerUserId: HUGO,
      }),
    ).resolves.toBeUndefined();

    expect(members.ownerCalls).toEqual([]);
    expect(spaces.events).toEqual([]);
  });

  it('resolves without asking for the owner when the only space of the leaver is of the whole organization', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState({ ownerUserId: HUGO })] });
    const members = atelierNordMembers({ removed: [HUGO], ownerKnown: false });

    await new HandOverPrivateSpaces(spaces, members).execute({
      organizationId: ATELIER_NORD,
      formerOwnerUserId: HUGO,
    });

    expect(members.ownerCalls).toEqual([]);
  });

  it('asks for the owner once when there are private spaces to hand over', async () => {
    const spaces = new InMemorySpaces({ spaces: [designState()] });
    const members = atelierNordMembers({ removed: [HUGO] });

    await new HandOverPrivateSpaces(spaces, members).execute({
      organizationId: ATELIER_NORD,
      formerOwnerUserId: HUGO,
    });

    expect(members.ownerCalls).toEqual([ATELIER_NORD]);
  });

  it('throws only when there are private spaces and the owner is unknown, handing nothing over', async () => {
    const spaces = new InMemorySpaces({ spaces: [designState()] });
    const members = atelierNordMembers({ removed: [HUGO], ownerKnown: false });

    await expect(
      new HandOverPrivateSpaces(spaces, members).execute({
        organizationId: ATELIER_NORD,
        formerOwnerUserId: HUGO,
      }),
    ).rejects.toThrow('The owner of the organization is not known yet.');

    expect(members.ownerCalls).toEqual([ATELIER_NORD]);
    expect(spaces.spaces.get(DESIGN)).toEqual(designState());
  });
});
