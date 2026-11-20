import { eventSchemas } from '@cadenway/contracts/events/task-service';
import type { TransactionScope } from '@cadenway/nest-common/database';
import type { OutboxWriter } from '@cadenway/nest-messaging/outbox';
import { describe, expect, it } from 'vitest';

import { TaskList } from '../../../../domain/aggregates/list/task-list.aggregate.js';
import { Space } from '../../../../domain/aggregates/space/space.aggregate.js';
import { spaceState, sprintState } from '../../../../domain/spaces.fixture.js';
import { OutboxSpaceEvents } from './outbox-space-events.adapter.js';

/** An event the outbox received. */
interface Appended {
  // #region Properties
  /** The name of the event. */
  readonly name: string;

  /** Its payload, before PostgreSQL gives it its id and instant. */
  readonly payload: Readonly<Record<string, unknown>>;
  // #endregion
}

/** When the deletion or the restoration was committed. */
const COMMITTED_AT: Date = new Date('2026-11-08T16:10:00Z');

/** Camille Martin, as the actor of the events. */
const BY_CAMILLE = { type: 'user', id: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30' } as const;

/**
 * Builds the events on an outbox that records each append.
 *
 * @returns The events, their records and how many appends woke the relay.
 */
function recording(): {
  readonly events: OutboxSpaceEvents;
  readonly appended: Appended[];
  readonly wakes: { count: number };
} {
  const appended: Appended[] = [];
  const wakes: { count: number } = { count: 0 };
  const outbox = {
    append: (
      _tx: TransactionScope,
      _schemas: unknown,
      name: string,
      payload: Readonly<Record<string, unknown>>,
    ): Promise<void> => {
      appended.push({ name, payload });
      return Promise.resolve();
    },
  } as unknown as OutboxWriter;
  return {
    events: new OutboxSpaceEvents({} as TransactionScope, outbox, (): void => {
      wakes.count += 1;
    }),
    appended,
    wakes,
  };
}

/**
 * Validates an appended payload with the schema of its event, as the outbox does, with the id and
 * the instant PostgreSQL gives it.
 *
 * @param event - The appended event.
 * @returns Whether the contract accepts it.
 */
function acceptedByContract(event: Appended): boolean {
  const schema = eventSchemas[event.name as keyof typeof eventSchemas];
  return schema.safeParse({
    id: '019a7005-6f7a-7b8c-9d0e-1f2a3b4c5d18',
    occurredAt: COMMITTED_AT.toISOString(),
    ...event.payload,
  }).success;
}

describe('OutboxSpaceEvents: the events of the deletions and the restorations match the contract', () => {
  it('appends space.deleted.v1 with the space and its version after the deletion', async () => {
    const { events, appended, wakes } = recording();

    await events.spaceDeleted(
      Space.restore(spaceState({ deletedAt: COMMITTED_AT, deletedBy: BY_CAMILLE, version: 6 })),
      BY_CAMILLE,
    );

    expect(appended).toEqual([
      {
        name: 'space.deleted.v1',
        payload: {
          organizationId: spaceState().organizationId,
          actor: BY_CAMILLE,
          version: 6,
          spaceId: spaceState().id,
        },
      },
    ]);
    expect(appended.every(acceptedByContract)).toBe(true);
    expect(wakes.count).toBe(1);
  });

  it('appends space.restored.v1 with the whole space, without changed', async () => {
    const { events, appended } = recording();

    await events.spaceRestored(
      Space.restore(spaceState({ restoredAt: COMMITTED_AT, version: 7 })),
      BY_CAMILLE,
    );

    expect(appended[0]?.name).toBe('space.restored.v1');
    expect(appended[0]?.payload).toMatchObject({
      version: 7,
      prefix: 'CAD',
      visibility: 'organization',
    });
    expect(appended[0]?.payload).not.toHaveProperty('changed');
    expect(appended.every(acceptedByContract)).toBe(true);
  });

  it('appends list.deleted.v1 with the list, its space and its version after the deletion', async () => {
    const { events, appended } = recording();

    await events.listDeleted(
      TaskList.restore(sprintState({ deletedAt: COMMITTED_AT, deletedBy: BY_CAMILLE, version: 3 })),
      BY_CAMILLE,
    );

    expect(appended).toEqual([
      {
        name: 'list.deleted.v1',
        payload: {
          organizationId: sprintState().organizationId,
          actor: BY_CAMILLE,
          version: 3,
          listId: sprintState().id,
          spaceId: sprintState().spaceId,
        },
      },
    ]);
    expect(appended.every(acceptedByContract)).toBe(true);
  });

  it('appends list.restored.v1 with the whole list and its switch', async () => {
    const { events, appended } = recording();

    await events.listRestored(
      TaskList.restore(
        sprintState({ restoredAt: COMMITTED_AT, organizationAccess: false, version: 4 }),
      ),
      BY_CAMILLE,
    );

    expect(appended[0]?.name).toBe('list.restored.v1');
    expect(appended[0]?.payload).toMatchObject({
      version: 4,
      organizationAccess: false,
      name: 'Sprint 14',
    });
    expect(appended.every(acceptedByContract)).toBe(true);
  });
});

describe('OutboxSpaceEvents: the republish of the access of a restored space or list matches the contract', () => {
  it('appends list.access-changed.v1 with the whole set, both members changed and nobody named', async () => {
    const { events, appended } = recording();

    await events.listAccessChanged(
      TaskList.restore(sprintState({ restoredAt: COMMITTED_AT, version: 4 })),
      [{ userId: '019a6f00-1b2c-7d3e-8f4a-5b6c7d8e9f40', role: 'comment' }],
      ['grants', 'organizationAccess'],
      [],
      BY_CAMILLE,
    );

    expect(appended[0]?.payload).toMatchObject({
      changed: ['grants', 'organizationAccess'],
      changedUserIds: [],
    });
    expect(appended.every(acceptedByContract)).toBe(true);
  });

  it('republishes an empty space access snapshot after restoration', async () => {
    const { events, appended } = recording();
    const space = Space.restore(spaceState({ restoredAt: COMMITTED_AT, version: 7 }));

    await events.spaceAccessRepublished(space, [], [], BY_CAMILLE);

    expect(appended[0]?.name).toBe('space.access-republished.v1');
    expect(appended[0]?.payload).toMatchObject({ grants: [], changedUserIds: [], version: 7 });
    expect(appended.every(acceptedByContract)).toBe(true);
  });

  it('appends space.access-changed.v1 naming every person who holds a grant, and the contract refuses nobody named', async () => {
    const { events, appended } = recording();
    const space = Space.restore(spaceState({ restoredAt: COMMITTED_AT, version: 7 }));

    await events.spaceAccessChanged(
      space,
      [{ userId: '019a6f00-1b2c-7d3e-8f4a-5b6c7d8e9f40', role: 'view' }],
      ['019a6f00-1b2c-7d3e-8f4a-5b6c7d8e9f40'],
      BY_CAMILLE,
    );
    await events.spaceAccessChanged(space, [], [], BY_CAMILLE);

    expect(appended.map(acceptedByContract)).toEqual([true, false]);
  });
});
