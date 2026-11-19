import { describe, expect, it } from 'vitest';

import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { SpaceField } from '../../../../../domain/value-objects/space/space-field.value-object.js';
import type { SpaceState } from '../../../../../domain/value-objects/space/space-state.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
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
  backlogState,
  designState,
  listGrantOf,
  marketingState,
  spaceGrantOf,
  spaceState,
} from '../../../spaces.fixture.js';
import { HandOverPrivateSpaces } from './hand-over-private-spaces.use-case.js';

/** What the use case records for a space it handed over: the system, not a member, acts. */
const SYSTEM = { type: 'system', id: 'task-service' } as const;

/** The leaver Hugo Dubois. */
const input = { organizationId: ATELIER_NORD, formerOwnerUserId: HUGO } as const;

/**
 * Builds a private space of Hugo Dubois; the ids and the instants follow the index, so the batches
 * take them in index order.
 *
 * @param index - Which space; it gives the id, the prefix and the creation instant.
 * @returns The state.
 */
function privateOfHugo(index: number): SpaceState {
  return designState({
    id: `019a7000-0000-7000-8000-${String(100_000 + index).padStart(12, '0')}`,
    prefix: `H${String.fromCharCode(65 + (Math.floor(index / 26) % 26))}${String.fromCharCode(65 + (index % 26))}`,
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)),
  });
}

/**
 * Wraps the unit of work of the fake with a change of the store of each run.
 *
 * @param spaces - The fake.
 * @param change - What replaces parts of the store, given the run number from 1.
 * @returns A unit of work over the same rows.
 */
function wrapped(
  spaces: InMemorySpaces,
  change: (store: SpacesStore, run: number) => Partial<SpacesStore>,
): SpacesUnitOfWork {
  let runs = 0;
  return {
    run: (work) => {
      runs += 1;
      const run = runs;
      return spaces.run((store) => work({ ...store, ...change(store, run) }));
    },
  };
}

describe('HandOverPrivateSpaces: one batch gives the private spaces of a leaver to the owner of the organization', () => {
  it('gives the private space of Hugo Dubois to Camille Martin, at the next version, and counts it', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState(), designState()] });

    const output = await new HandOverPrivateSpaces(
      spaces,
      atelierNordMembers({ removed: [HUGO] }),
    ).execute(input);

    expect(output).toEqual({ outcome: 'handed-over', handedOver: 1, awaitingOwner: 0 });
    expect(spaces.spaces.get(DESIGN)).toEqual(designState({ ownerUserId: CAMILLE, version: 2 }));
  });

  it('appends space.updated for ownerUserId, by the system actor', async () => {
    const spaces = new InMemorySpaces({ spaces: [designState()] });

    await new HandOverPrivateSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute(input);

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

  it('hands over every private space of the batch, with one event each', async () => {
    const spaces = new InMemorySpaces({ spaces: [privateOfHugo(0), privateOfHugo(1)] });

    const output = await new HandOverPrivateSpaces(
      spaces,
      atelierNordMembers({ removed: [HUGO] }),
    ).execute(input);

    expect(output).toEqual({ outcome: 'handed-over', handedOver: 2, awaitingOwner: 0 });
    expect([...spaces.spaces.values()].map((space) => space.ownerUserId)).toEqual([
      CAMILLE,
      CAMILLE,
    ]);
    expect(spaces.events.map((event) => event.kind)).toEqual(['spaceUpdated', 'spaceUpdated']);
  });

  it('keeps the former member as owner of a space of the whole organization', async () => {
    const shared = marketingState({ ownerUserId: HUGO });
    const spaces = new InMemorySpaces({ spaces: [shared, designState()] });

    await new HandOverPrivateSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute(input);

    expect(spaces.spaces.get(MARKETING)).toEqual(shared);
    expect(spaces.events).toHaveLength(1);
  });

  it('leaves the private spaces of the other members as they are', async () => {
    const inesPrivate = spaceState({ id: PRODUIT, visibility: 'private', ownerUserId: INES });
    const spaces = new InMemorySpaces({ spaces: [inesPrivate, designState()] });

    await new HandOverPrivateSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute(input);

    expect(spaces.spaces.get(PRODUIT)).toEqual(inesPrivate);
  });

  it('leaves the private spaces of the same account in another organization as they are', async () => {
    const elsewhere = designState({ organizationId: OTHER_ORGANIZATION });
    const spaces = new InMemorySpaces({ spaces: [elsewhere] });

    const output = await new HandOverPrivateSpaces(
      spaces,
      atelierNordMembers({ removed: [HUGO] }),
    ).execute(input);

    expect(output).toEqual({ outcome: 'none-left' });
    expect(spaces.spaces.get(DESIGN)).toEqual(elsewhere);
    expect(spaces.events).toEqual([]);
  });
});

describe('HandOverPrivateSpaces: batches of 100, each in its own transaction, until none is left', () => {
  it('takes 250 private spaces in three calls of 100, 100 and 50, then answers none-left', async () => {
    const spaces = new InMemorySpaces({
      spaces: Array.from({ length: 250 }, (_, index) => privateOfHugo(index)),
    });
    const handOver = new HandOverPrivateSpaces(spaces, atelierNordMembers({ removed: [HUGO] }));

    const outputs = [];
    for (let call = 0; call < 4; call += 1) {
      outputs.push(await handOver.execute(input));
    }

    expect(outputs).toEqual([
      { outcome: 'handed-over', handedOver: 100, awaitingOwner: 0 },
      { outcome: 'handed-over', handedOver: 100, awaitingOwner: 0 },
      { outcome: 'handed-over', handedOver: 50, awaitingOwner: 0 },
      { outcome: 'none-left' },
    ]);
    expect(spaces.runs).toBe(4);
    expect(spaces.events).toHaveLength(250);
    expect([...spaces.spaces.values()].every((space) => space.ownerUserId === CAMILLE)).toBe(true);
  });

  it('takes the oldest spaces first', async () => {
    const spaces = new InMemorySpaces({
      spaces: Array.from({ length: 101 }, (_, index) => privateOfHugo(100 - index)),
    });

    await new HandOverPrivateSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute(input);

    expect(
      [...spaces.spaces.values()]
        .filter((space) => space.ownerUserId === HUGO)
        .map((space) => space.id),
    ).toEqual([privateOfHugo(100).id]);
  });

  it('rolls back a failed batch alone and keeps the batches before it', async () => {
    const spaces = new InMemorySpaces({
      spaces: Array.from({ length: 150 }, (_, index) => privateOfHugo(index)),
    });
    const failing = wrapped(spaces, (store, run) => ({
      events: {
        ...store.events,
        spaceUpdated: (
          space: Space,
          changed: readonly SpaceField[],
          actor: EventActor,
        ): Promise<void> =>
          run === 2
            ? Promise.reject(new Error('The outbox is unavailable.'))
            : store.events.spaceUpdated(space, changed, actor),
      },
    }));
    const handOver = new HandOverPrivateSpaces(failing, atelierNordMembers({ removed: [HUGO] }));

    await handOver.execute(input);
    await expect(handOver.execute(input)).rejects.toThrow('The outbox is unavailable.');

    const left = [...spaces.spaces.values()].filter((space) => space.ownerUserId === HUGO);
    expect(left).toHaveLength(50);
    expect(spaces.events).toHaveLength(100);
    expect(await handOver.execute(input)).toEqual({
      outcome: 'handed-over',
      handedOver: 50,
      awaitingOwner: 0,
    });
    expect(spaces.events).toHaveLength(150);
  });

  it('answers none-left the second time and changes nothing, so a job run again is harmless', async () => {
    const spaces = new InMemorySpaces({ spaces: [designState()] });
    const handOver = new HandOverPrivateSpaces(spaces, atelierNordMembers({ removed: [HUGO] }));
    await handOver.execute(input);
    const stored = new Map(spaces.spaces);
    const events = [...spaces.events];

    const second = await handOver.execute(input);

    expect(second).toEqual({ outcome: 'none-left' });
    expect(spaces.spaces).toEqual(stored);
    expect(spaces.events).toEqual(events);
  });
});

describe('HandOverPrivateSpaces: a person who is a member again keeps their spaces', () => {
  it('locks the batch before it reads the copy, and changes nothing while the copy holds the account', async () => {
    const spaces = new InMemorySpaces({ spaces: [designState()] });
    const members = atelierNordMembers();
    const readingsAtLock: number[] = [];
    const spied = wrapped(spaces, (store) => ({
      spaces: {
        ...store.spaces,
        lockPrivateOwnedBy: (
          organizationId: string,
          ownerUserId: string,
          limit: number,
        ): Promise<Space[]> => {
          readingsAtLock.push(members.roleCalls.length);
          return store.spaces.lockPrivateOwnedBy(organizationId, ownerUserId, limit);
        },
      },
    }));

    const output = await new HandOverPrivateSpaces(spied, members).execute(input);

    expect(output).toEqual({ outcome: 'member-again' });
    expect(readingsAtLock).toEqual([0]);
    expect(members.roleCalls).toHaveLength(1);
    expect(members.ownerCalls).toEqual([]);
    expect(spaces.spaces.get(DESIGN)).toEqual(designState());
    expect(spaces.events).toEqual([]);
  });

  it('touches nothing when the copy names the leaver the owner of the organization', async () => {
    const owned = designState({ ownerUserId: CAMILLE });
    const spaces = new InMemorySpaces({ spaces: [owned] });

    const output = await new HandOverPrivateSpaces(
      spaces,
      atelierNordMembers({ removed: [CAMILLE] }),
    ).execute({ organizationId: ATELIER_NORD, formerOwnerUserId: CAMILLE });

    expect(output).toEqual({ outcome: 'member-again' });
    expect(spaces.spaces.get(DESIGN)).toEqual(owned);
    expect(spaces.events).toEqual([]);
  });
});

describe('HandOverPrivateSpaces: while the copy does not hold the owner, the spaces await one', () => {
  /** The leaver Hugo Dubois, while the copy does not hold the owner of the organization. */
  const ownerUnknown = (): ReturnType<typeof atelierNordMembers> =>
    atelierNordMembers({ removed: [HUGO], ownerKnown: false });

  it('marks every private space of the batch as awaiting an owner, keeping its owner and its version, without event', async () => {
    const second = privateOfHugo(1);
    const spaces = new InMemorySpaces({ spaces: [designState(), second, spaceState()] });

    const output = await new HandOverPrivateSpaces(spaces, ownerUnknown()).execute(input);

    expect(output).toEqual({ outcome: 'handed-over', handedOver: 0, awaitingOwner: 2 });
    expect(spaces.spaces.get(DESIGN)).toEqual(designState({ awaitingOwner: true }));
    expect([...spaces.spaces.values()].map((space) => space.awaitingOwner)).toEqual([
      true,
      true,
      false,
    ]);
    expect(spaces.events).toEqual([]);
  });

  it('keeps the space of the whole organization of the leaver as it is', async () => {
    const shared = marketingState({ ownerUserId: HUGO });
    const spaces = new InMemorySpaces({ spaces: [shared, designState()] });

    await new HandOverPrivateSpaces(spaces, ownerUnknown()).execute(input);

    expect(spaces.spaces.get(MARKETING)).toEqual(shared);
  });

  it('shows nobody the space that awaits an owner, not even the former owner', async () => {
    const spaces = new InMemorySpaces({ spaces: [designState()] });
    await new HandOverPrivateSpaces(spaces, ownerUnknown()).execute(input);

    const visible = await spaces.run((store) =>
      Promise.all(
        [HUGO, CAMILLE, INES].map((userId) =>
          store.spaces.listVisible(ATELIER_NORD, { userId, role: 'member' }, null, 10),
        ),
      ),
    );

    expect(visible).toEqual([[], [], []]);
  });

  it('answers none-left the second time, without asking for the owner again', async () => {
    const spaces = new InMemorySpaces({ spaces: [designState()] });
    const members = ownerUnknown();
    const handOver = new HandOverPrivateSpaces(spaces, members);
    await handOver.execute(input);

    const second = await handOver.execute(input);

    expect(second).toEqual({ outcome: 'none-left' });
    expect(members.ownerCalls).toEqual([ATELIER_NORD]);
    expect(spaces.spaces.get(DESIGN)).toEqual(designState({ awaitingOwner: true }));
  });
});

describe('HandOverPrivateSpaces: the copy is read only when there is something to hand over', () => {
  it('answers none-left without reading the copy when the leaver has no private space', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState({ ownerUserId: HUGO })] });
    const members = atelierNordMembers({ removed: [HUGO], ownerKnown: false });

    const output = await new HandOverPrivateSpaces(spaces, members).execute(input);

    expect(output).toEqual({ outcome: 'none-left' });
    expect(members.roleCalls).toEqual([]);
    expect(members.ownerCalls).toEqual([]);
    expect(spaces.events).toEqual([]);
  });

  it('does not take a space that already awaits an owner', async () => {
    const spaces = new InMemorySpaces({ spaces: [designState({ awaitingOwner: true })] });
    const members = atelierNordMembers({ removed: [HUGO], ownerKnown: false });

    const output = await new HandOverPrivateSpaces(spaces, members).execute(input);

    expect(output).toEqual({ outcome: 'none-left' });
    expect(members.ownerCalls).toEqual([]);
  });

  it('asks for the owner once per batch when there are private spaces to hand over', async () => {
    const spaces = new InMemorySpaces({ spaces: [designState()] });
    const members = atelierNordMembers({ removed: [HUGO] });

    await new HandOverPrivateSpaces(spaces, members).execute(input);

    expect(members.ownerCalls).toEqual([ATELIER_NORD]);
  });
});

describe('HandOverPrivateSpaces: the new owner keeps no grant on the spaces handed over to them', () => {
  /** A list of the private space "Design". */
  const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

  it('removes the grants Camille Martin held on Design and its list, with their access events', async () => {
    const spaces = new InMemorySpaces({
      spaces: [designState()],
      lists: [backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes', version: 2 })],
      grants: [
        spaceGrantOf(DESIGN, CAMILLE, 'view'),
        spaceGrantOf(DESIGN, INES, 'edit'),
        listGrantOf(DESIGN, MAQUETTES, CAMILLE, 'edit'),
      ],
    });

    const outcome = await new HandOverPrivateSpaces(
      spaces,
      atelierNordMembers({ removed: [HUGO] }),
    ).execute(input);

    expect(outcome).toEqual({ outcome: 'handed-over', handedOver: 1, awaitingOwner: 0 });
    expect(spaces.grantsOf({ kind: 'space', spaceId: DESIGN })).toEqual([
      { userId: INES, role: 'edit' },
    ]);
    expect(spaces.grantsOf({ kind: 'list', spaceId: DESIGN, listId: MAQUETTES })).toEqual([]);
    expect(spaces.lists.get(MAQUETTES)?.version).toBe(3);
    expect(spaces.events).toEqual([
      expect.objectContaining({ kind: 'spaceUpdated', spaceId: DESIGN, version: 2 }),
      {
        kind: 'spaceAccessChanged',
        spaceId: DESIGN,
        version: 2,
        grants: [{ userId: INES, role: 'edit' }],
        changedUserIds: [CAMILLE],
        actor: SYSTEM,
      },
      {
        kind: 'listAccessChanged',
        listId: MAQUETTES,
        spaceId: DESIGN,
        version: 3,
        organizationAccess: true,
        grants: [],
        changed: ['grants'],
        changedUserIds: [CAMILLE],
        actor: SYSTEM,
      },
    ]);
  });

  it('emits no access event when the new owner held no grant there', async () => {
    const spaces = new InMemorySpaces({
      spaces: [designState()],
      grants: [spaceGrantOf(DESIGN, INES, 'edit')],
    });

    await new HandOverPrivateSpaces(spaces, atelierNordMembers({ removed: [HUGO] })).execute(input);

    expect(spaces.events.map((event) => event.kind)).toEqual(['spaceUpdated']);
  });
});
