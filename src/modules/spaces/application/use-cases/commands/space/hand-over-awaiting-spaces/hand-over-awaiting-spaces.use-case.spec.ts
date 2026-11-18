import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  DESIGN,
  HUGO,
  InMemorySpaces,
  MARKETING,
  OTHER_ORGANIZATION,
  PRODUIT,
  atelierNordMembers,
  designState,
  marketingState,
  spaceState,
} from '../../../spaces.fixture.js';
import { HandOverAwaitingSpaces } from './hand-over-awaiting-spaces.use-case.js';

/** What the use case records for a space it handed over: the system, not a member, acts. */
const SYSTEM = { type: 'system', id: 'task-service' } as const;

/** The second private space of Hugo Dubois, "Recherche" (RCH). */
const RECHERCHE = '019a7000-0000-7000-8000-000000000004';

/** The private space "Design" of Hugo Dubois, whose owner left while the owner of the organization was unknown. */
function awaitingDesign(): ReturnType<typeof designState> {
  return designState({ awaitingOwner: true });
}

describe('HandOverAwaitingSpaces: the owner of the organization takes the spaces that await one', () => {
  it('gives the space to Camille Martin, at the next version, no longer awaiting', async () => {
    const spaces = new InMemorySpaces({ spaces: [awaitingDesign()] });

    await new HandOverAwaitingSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute({
      organizationId: ATELIER_NORD,
    });

    expect(spaces.spaces.get(DESIGN)).toEqual(
      designState({ ownerUserId: CAMILLE, version: 2, awaitingOwner: false }),
    );
  });

  it('appends space.updated for ownerUserId, by the system actor', async () => {
    const spaces = new InMemorySpaces({ spaces: [awaitingDesign()] });

    await new HandOverAwaitingSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute({
      organizationId: ATELIER_NORD,
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

  it('hands over every space that awaits an owner, with one event each', async () => {
    const second = designState({
      id: RECHERCHE,
      name: 'Recherche',
      prefix: 'RCH',
      awaitingOwner: true,
    });
    const spaces = new InMemorySpaces({ spaces: [awaitingDesign(), second] });

    await new HandOverAwaitingSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute({
      organizationId: ATELIER_NORD,
    });

    expect([...spaces.spaces.values()].map((space) => space.ownerUserId)).toEqual([
      CAMILLE,
      CAMILLE,
    ]);
    expect(spaces.events.map((event) => event.kind)).toEqual(['spaceUpdated', 'spaceUpdated']);
  });

  it('makes the space visible to its new owner and to nobody else', async () => {
    const spaces = new InMemorySpaces({ spaces: [awaitingDesign()] });

    await new HandOverAwaitingSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute({
      organizationId: ATELIER_NORD,
    });

    const [forCamille, forHugo] = await spaces.run((store) =>
      Promise.all(
        [CAMILLE, HUGO].map((userId) => store.spaces.listVisible(ATELIER_NORD, userId, null, 10)),
      ),
    );
    expect(forCamille?.map((space) => space.snapshot.id)).toEqual([DESIGN]);
    expect(forHugo).toEqual([]);
  });
});

describe('HandOverAwaitingSpaces: nothing happens while the owner is unknown', () => {
  it('leaves the space awaiting, with no event', async () => {
    const spaces = new InMemorySpaces({ spaces: [awaitingDesign()] });

    await new HandOverAwaitingSpaces(
      spaces,
      atelierNordMembers({ removed: [HUGO], ownerKnown: false }),
    ).execute({ organizationId: ATELIER_NORD });

    expect(spaces.spaces.get(DESIGN)).toEqual(awaitingDesign());
    expect(spaces.events).toEqual([]);
  });

  it('does not fail, so the member event that triggered it still commits', async () => {
    const spaces = new InMemorySpaces({ spaces: [awaitingDesign()] });

    await expect(
      new HandOverAwaitingSpaces(
        spaces,
        atelierNordMembers({ removed: [HUGO], ownerKnown: false }),
      ).execute({ organizationId: ATELIER_NORD }),
    ).resolves.toBeUndefined();
  });
});

describe('HandOverAwaitingSpaces: only the spaces that await an owner, in the organization, change', () => {
  it('leaves the private spaces that do not await an owner as they are', async () => {
    const spaces = new InMemorySpaces({ spaces: [designState()] });

    await new HandOverAwaitingSpaces(spaces, atelierNordMembers()).execute({
      organizationId: ATELIER_NORD,
    });

    expect(spaces.spaces.get(DESIGN)).toEqual(designState());
    expect(spaces.events).toEqual([]);
  });

  it('leaves the spaces of the whole organization as they are', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ ownerUserId: HUGO }), marketingState({ ownerUserId: HUGO })],
    });

    await new HandOverAwaitingSpaces(spaces, atelierNordMembers()).execute({
      organizationId: ATELIER_NORD,
    });

    expect(spaces.spaces.get(PRODUIT)).toEqual(spaceState({ ownerUserId: HUGO }));
    expect(spaces.spaces.get(MARKETING)).toEqual(marketingState({ ownerUserId: HUGO }));
    expect(spaces.events).toEqual([]);
  });

  it('leaves the spaces that await an owner in another organization as they are', async () => {
    const elsewhere = designState({ organizationId: OTHER_ORGANIZATION, awaitingOwner: true });
    const spaces = new InMemorySpaces({ spaces: [elsewhere] });

    await new HandOverAwaitingSpaces(spaces, atelierNordMembers()).execute({
      organizationId: ATELIER_NORD,
    });

    expect(spaces.spaces.get(DESIGN)).toEqual(elsewhere);
    expect(spaces.events).toEqual([]);
  });

  it('only clears the wait, with no version and no event, when the owner already owns the space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [designState({ ownerUserId: CAMILLE, awaitingOwner: true })],
    });

    await new HandOverAwaitingSpaces(spaces, atelierNordMembers()).execute({
      organizationId: ATELIER_NORD,
    });

    expect(spaces.spaces.get(DESIGN)).toEqual(designState({ ownerUserId: CAMILLE }));
    expect(spaces.events).toEqual([]);
  });
});

describe('HandOverAwaitingSpaces: the same member event can be delivered again', () => {
  it('appends nothing and changes nothing the second time', async () => {
    const spaces = new InMemorySpaces({ spaces: [awaitingDesign()] });
    const handOver = new HandOverAwaitingSpaces(spaces, atelierNordMembers({ removed: [HUGO] }));
    await handOver.execute({ organizationId: ATELIER_NORD });
    const stored = new Map(spaces.spaces);
    const events = [...spaces.events];

    await handOver.execute({ organizationId: ATELIER_NORD });

    expect(spaces.spaces).toEqual(stored);
    expect(spaces.events).toEqual(events);
    expect(spaces.spaces.get(DESIGN)?.version).toBe(2);
  });

  it('hands over, once the owner is known, the spaces it left awaiting before', async () => {
    const spaces = new InMemorySpaces({ spaces: [awaitingDesign()] });
    await new HandOverAwaitingSpaces(
      spaces,
      atelierNordMembers({ removed: [HUGO], ownerKnown: false }),
    ).execute({ organizationId: ATELIER_NORD });

    await new HandOverAwaitingSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute({
      organizationId: ATELIER_NORD,
    });

    expect(spaces.spaces.get(DESIGN)).toMatchObject({
      ownerUserId: CAMILLE,
      awaitingOwner: false,
      version: 2,
    });
    expect(spaces.events).toHaveLength(1);
  });
});
