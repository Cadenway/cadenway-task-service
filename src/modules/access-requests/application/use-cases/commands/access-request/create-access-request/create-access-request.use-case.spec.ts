import { describe, expect, it } from 'vitest';

import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import { AccessRequestRefusal } from '../../../../models/access-request/access-request-refusal.model.js';
import {
  ATELIER_NORD,
  BUDGET,
  CAMILLE,
  DIR_12,
  DIRECTION,
  FakeAccessTargets,
  FakeMembers,
  FakeTaskReferences,
  HUGO,
  InMemoryAccessRequests,
  LEA,
  NOW,
  OTHER_ORGANIZATION,
  UNKNOWN_SPACE,
} from '../../../access-requests.fixture.js';
import type { CreateAccessRequestInput } from './create-access-request.input.js';
import { CreateAccessRequest } from './create-access-request.use-case.js';

/** The fakes of one spec. */
interface Wiring {
  // #region Properties
  /** The requests and attempts. */
  readonly store: InMemoryAccessRequests;

  /** The copy of the memberships. */
  readonly members: FakeMembers;

  /** The spaces module. */
  readonly targets: FakeAccessTargets;

  /** The tasks module. */
  readonly tasks: FakeTaskReferences;

  /** The use case. */
  readonly useCase: CreateAccessRequest;
  // #endregion
}

/**
 * Wires the use case on the fakes.
 *
 * @param roles - Roles of the copy to change.
 * @param store - The requests and attempts.
 * @returns The fakes and the use case.
 */
function wire(
  roles: Readonly<Record<string, MemberRole | null>> = {},
  store: InMemoryAccessRequests = new InMemoryAccessRequests(),
): Wiring {
  const members = new FakeMembers(roles);
  const targets = new FakeAccessTargets();
  const tasks = new FakeTaskReferences();
  return {
    store,
    members,
    targets,
    tasks,
    useCase: new CreateAccessRequest(store, members, targets, tasks),
  };
}

/**
 * Camille Martin asks for the private space "Direction".
 *
 * @param overrides - Members to replace.
 * @returns The input.
 */
function askDirection(overrides: Partial<CreateAccessRequestInput> = {}): CreateAccessRequestInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    target: { kind: 'space', spaceId: DIRECTION },
    message: 'Je dois chiffrer la part outillage du budget 2027.',
    ...overrides,
  };
}

/**
 * An instant some minutes before `NOW`.
 *
 * @param minutes - How many minutes before.
 * @returns The instant.
 */
function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

describe('CreateAccessRequest: a request is stored for a target the requester has no role on', () => {
  it('stores the request of Camille Martin for "Direction", pending, with its message', async () => {
    const { store, useCase } = wire();

    await useCase.execute(askDirection());

    expect(store.pending()).toEqual([
      expect.objectContaining({
        organizationId: ATELIER_NORD,
        target: 'space',
        targetId: DIRECTION,
        spaceId: DIRECTION,
        listId: null,
        taskId: null,
        requesterUserId: CAMILLE,
        message: 'Je dois chiffrer la part outillage du budget 2027.',
        status: 'pending',
      }),
    ]);
  });

  it('appends space.access-requested at version 1 with the name of the space and its owner', async () => {
    const { store, useCase } = wire();

    await useCase.execute(askDirection());

    expect(store.events).toEqual([
      {
        kind: 'accessRequested',
        requestId: store.pending()[0]?.id,
        target: 'space',
        version: 1,
        names: {
          spaceName: 'Direction',
          spaceOwnerUserId: LEA,
          listName: null,
          taskName: null,
        },
      },
    ]);
  });

  it('stores a list request with the list, and names the list in its event', async () => {
    const { store, useCase } = wire();

    await useCase.execute(
      askDirection({ actorUserId: HUGO, target: { kind: 'list', listId: BUDGET }, message: null }),
    );

    expect(store.pending()).toEqual([
      expect.objectContaining({ target: 'list', targetId: BUDGET, listId: BUDGET, message: null }),
    ]);
    expect(store.events[0]).toMatchObject({
      target: 'list',
      names: { listName: 'Budget', taskName: null },
    });
  });

  it('stores a task request with the list the task is in, its id and its key', async () => {
    const { store, useCase } = wire();

    await useCase.execute(
      askDirection({ actorUserId: HUGO, target: { kind: 'task', taskKey: 'DIR-12' } }),
    );

    expect(store.pending()).toEqual([
      expect.objectContaining({
        target: 'task',
        targetId: DIR_12,
        spaceId: DIRECTION,
        listId: BUDGET,
        taskId: DIR_12,
        taskKey: 'DIR-12',
      }),
    ]);
    expect(store.events[0]).toMatchObject({
      target: 'task',
      names: { spaceName: 'Direction', listName: 'Budget', taskName: 'Budget 2027' },
    });
  });

  it('trims the message and stores an empty one as none', async () => {
    const { store, useCase } = wire();

    await useCase.execute(askDirection({ message: '   ' }));

    expect(store.pending()[0]?.message).toBeNull();
  });
});

describe('CreateAccessRequest: a request is not stored when the rules say so', () => {
  it('stores nothing for a space the organization does not hold', async () => {
    const { store, useCase } = wire();

    await useCase.execute(askDirection({ target: { kind: 'space', spaceId: UNKNOWN_SPACE } }));

    expect(store.pending()).toEqual([]);
    expect(store.events).toEqual([]);
  });

  it('stores nothing for a task key the organization does not hold', async () => {
    const { store, useCase } = wire();

    await useCase.execute(askDirection({ target: { kind: 'task', taskKey: 'DIR-99' } }));

    expect(store.pending()).toEqual([]);
  });

  it('stores nothing when the requester already has a role on the space, whatever the role', async () => {
    for (const role of ['edit', 'comment', 'view'] as const) {
      const { store, targets, useCase } = wire();
      targets.allow(CAMILLE, DIRECTION, role, false);

      await useCase.execute(askDirection());

      expect(store.pending()).toEqual([]);
    }
  });

  it('stores nothing for a task whose list the requester already has a role on', async () => {
    const { store, targets, useCase } = wire();
    targets.allow(HUGO, BUDGET, 'view');

    await useCase.execute(
      askDirection({ actorUserId: HUGO, target: { kind: 'task', taskKey: 'DIR-12' } }),
    );

    expect(store.pending()).toEqual([]);
  });

  it('never stores the request of a guest for a space', async () => {
    const { store, useCase } = wire({ [CAMILLE]: 'guest' });

    await useCase.execute(askDirection());

    expect(store.pending()).toEqual([]);
    expect(store.events).toEqual([]);
  });

  it('stores the request of a guest for a list', async () => {
    const { store, useCase } = wire({ [HUGO]: 'guest' });

    await useCase.execute(
      askDirection({ actorUserId: HUGO, target: { kind: 'list', listId: BUDGET } }),
    );

    expect(store.pending()).toHaveLength(1);
  });
});

describe('CreateAccessRequest: one pending request per requester and target', () => {
  it('changes nothing and emits nothing when the same request is pending already', async () => {
    const { store, useCase } = wire();
    await useCase.execute(askDirection());

    await useCase.execute(askDirection({ message: 'Une autre raison.' }));

    expect(store.pending()).toHaveLength(1);
    expect(store.pending()[0]?.message).toBe('Je dois chiffrer la part outillage du budget 2027.');
    expect(store.events).toHaveLength(1);
  });

  it('still counts the second attempt towards the hourly limit', async () => {
    const { store, useCase } = wire();
    await useCase.execute(askDirection());

    await useCase.execute(askDirection());

    expect(store.attemptsOf(CAMILLE)).toHaveLength(2);
  });

  it('keeps a request for the list apart from the request for one of its tasks', async () => {
    const { store, useCase } = wire();
    const hugo = { actorUserId: HUGO, message: null } as const;

    await useCase.execute(askDirection({ ...hugo, target: { kind: 'list', listId: BUDGET } }));
    await useCase.execute(askDirection({ ...hugo, target: { kind: 'task', taskKey: 'DIR-12' } }));

    expect(store.pending().map((request) => request.target)).toEqual(['list', 'task']);
  });
});

describe('CreateAccessRequest: always the same answer, whatever the target', () => {
  it('resolves the same way for an unknown, a seen, an asked and a stored target', async () => {
    const { targets, useCase } = wire();
    targets.allow(HUGO, DIRECTION, 'view', false);

    await expect(useCase.execute(askDirection())).resolves.toBeUndefined();
    await expect(useCase.execute(askDirection())).resolves.toBeUndefined();
    await expect(
      useCase.execute(askDirection({ target: { kind: 'space', spaceId: UNKNOWN_SPACE } })),
    ).resolves.toBeUndefined();
    await expect(useCase.execute(askDirection({ actorUserId: HUGO }))).resolves.toBeUndefined();
  });

  it('runs the same statements for a stored request, an asked one, a seen target and an unknown space, but the event', async () => {
    const stored = wire();
    const asked = wire();
    const seen = wire();
    const unknown = wire();
    seen.targets.allow(CAMILLE, DIRECTION, 'view', false);
    await asked.useCase.execute(askDirection());
    asked.store.calls.length = 0;
    asked.members.calls.length = 0;
    asked.targets.calls.length = 0;

    await stored.useCase.execute(askDirection());
    await asked.useCase.execute(askDirection());
    await seen.useCase.execute(askDirection());
    await unknown.useCase.execute(
      askDirection({ target: { kind: 'space', spaceId: UNKNOWN_SPACE } }),
    );

    const statements = (calls: readonly string[]): string[] =>
      calls.filter((call) => !call.startsWith('events.'));
    for (const other of [asked, seen, unknown]) {
      expect(other.members.calls).toEqual(stored.members.calls);
      expect(other.targets.calls.map((call) => call.split(':')[1])).toEqual(
        stored.targets.calls.map((call) => call.split(':')[1]),
      );
      expect(statements(other.store.calls)).toEqual(statements(stored.store.calls));
    }
    expect(stored.store.calls).toContain('requests.insertPending');
    expect(stored.store.calls.at(-1)).toBe('events.accessRequested');
    expect(unknown.store.calls).not.toContain('events.accessRequested');
  });

  it('reads a task and a list for an unknown key as for a known one', async () => {
    const known = wire();
    const unknown = wire();

    await known.useCase.execute(askDirection({ target: { kind: 'task', taskKey: 'DIR-12' } }));
    await unknown.useCase.execute(askDirection({ target: { kind: 'task', taskKey: 'DIR-99' } }));

    expect(unknown.tasks.calls).toHaveLength(known.tasks.calls.length);
    expect(unknown.targets.calls.map((call) => call.split(':')[1])).toEqual(['list']);
    expect(known.targets.calls).toEqual([`find:list:${BUDGET}`]);
  });
});

describe('CreateAccessRequest: the target is read under FOR SHARE locks, the same for every outcome', () => {
  it('reads a space under a FOR SHARE lock', async () => {
    const { targets, tasks, useCase } = wire();

    await useCase.execute(askDirection());

    expect(targets.locks).toEqual(['share-unless-locked']);
    expect(tasks.locks).toEqual([]);
  });

  it('reads a list under a FOR SHARE lock', async () => {
    const { targets, useCase } = wire();

    await useCase.execute(askDirection({ target: { kind: 'list', listId: BUDGET } }));

    expect(targets.locks).toEqual(['share-unless-locked']);
  });

  it('reads the task under a FOR SHARE SKIP LOCKED lock, then its list under another, in that order', async () => {
    const { targets, tasks, useCase } = wire();
    const order: string[] = [];
    const findByKey = tasks.findByKey.bind(tasks);
    const find = targets.find.bind(targets);
    tasks.findByKey = (...args: Parameters<FakeTaskReferences['findByKey']>) => {
      order.push(`task:${args[2]}`);
      return findByKey(...args);
    };
    targets.find = (...args: Parameters<FakeAccessTargets['find']>) => {
      order.push(`${args[3].kind}:${args[4]}`);
      return find(...args);
    };

    await useCase.execute(askDirection({ target: { kind: 'task', taskKey: 'DIR-12' } }));

    expect(order).toEqual(['task:share-unless-locked', 'list:share-unless-locked']);
  });

  it('takes the same locks for an unknown key, a task in the trash or a deleted list, as for a known one', async () => {
    const known = wire();
    const unknown = wire();
    unknown.tasks.tasks = [];

    await known.useCase.execute(askDirection({ target: { kind: 'task', taskKey: 'DIR-12' } }));
    await unknown.useCase.execute(askDirection({ target: { kind: 'task', taskKey: 'DIR-12' } }));

    expect(unknown.tasks.locks).toEqual(known.tasks.locks);
    expect(unknown.targets.locks).toEqual(known.targets.locks);
    expect(unknown.store.calls.filter((call) => !call.startsWith('events.'))).toEqual(
      known.store.calls.filter((call) => !call.startsWith('events.')),
    );
  });
});

describe('CreateAccessRequest: 10 requests per requester within the last hour, stored or not', () => {
  it('takes the tenth request of the hour', async () => {
    const attempts = Array.from({ length: 9 }, (_, index) => ({
      userId: CAMILLE,
      at: minutesAgo(index + 1),
    }));
    const { store, useCase } = wire({}, new InMemoryAccessRequests([], attempts));

    await useCase.execute(askDirection());

    expect(store.pending()).toHaveLength(1);
    expect(store.attemptsOf(CAMILLE)).toHaveLength(10);
  });

  it('refuses the eleventh with when the oldest counted request leaves the hour', async () => {
    const attempts = Array.from({ length: 10 }, (_, index) => ({
      userId: CAMILLE,
      at: minutesAgo(index * 5 + 2),
    }));
    const { useCase } = wire({}, new InMemoryAccessRequests([], attempts));

    await expect(useCase.execute(askDirection())).rejects.toThrow(
      expect.objectContaining({
        refusal: {
          reason: 'limit-reached',
          nextAvailableAt: new Date('2026-11-08T12:13:00.000Z'),
          retryAfterSeconds: 780,
        },
      }) as AccessRequestRefusal,
    );
  });

  it('counts the refused attempt for nothing, stores nothing and reads no target', async () => {
    const attempts = Array.from({ length: 10 }, (_, index) => ({
      userId: CAMILLE,
      at: minutesAgo(index + 1),
    }));
    const { store, targets, useCase } = wire({}, new InMemoryAccessRequests([], attempts));

    await expect(useCase.execute(askDirection())).rejects.toThrow(AccessRequestRefusal);

    expect(store.attemptsOf(CAMILLE)).toHaveLength(10);
    expect(store.pending()).toEqual([]);
    expect(targets.calls).toEqual([]);
  });

  it('counts the requests that were not stored, so that the limit tells nothing', async () => {
    const { store, useCase } = wire();
    for (let index = 0; index < 10; index += 1) {
      await useCase.execute(askDirection({ target: { kind: 'space', spaceId: UNKNOWN_SPACE } }));
    }

    await expect(useCase.execute(askDirection())).rejects.toThrow(AccessRequestRefusal);
    expect(store.pending()).toEqual([]);
  });

  it('counts per requester and per organization', async () => {
    const attempts = Array.from({ length: 10 }, (_, index) => ({
      userId: HUGO,
      at: minutesAgo(index + 1),
    }));
    const { store, useCase } = wire({}, new InMemoryAccessRequests([], attempts));

    await useCase.execute(askDirection());

    expect(store.pending()).toHaveLength(1);
  });

  it('deletes the attempts of the requester that left the hour, and records this one', async () => {
    const attempts = [
      { userId: CAMILLE, at: minutesAgo(61) },
      { userId: CAMILLE, at: minutesAgo(60) },
      { userId: CAMILLE, at: minutesAgo(30) },
      { userId: HUGO, at: minutesAgo(90) },
    ];
    const { store, useCase } = wire({}, new InMemoryAccessRequests([], attempts));

    await useCase.execute(askDirection());

    expect(store.attemptsOf(CAMILLE)).toEqual([minutesAgo(30), NOW]);
    expect(store.attemptsOf(HUGO)).toEqual([minutesAgo(90)]);
  });
});

describe('CreateAccessRequest: the requester is a current member, serialized with themselves', () => {
  it('answers organization-not-found for an account the copy does not hold, and records nothing', async () => {
    const { store, targets, useCase } = wire({ [CAMILLE]: null });

    await expect(useCase.execute(askDirection())).rejects.toThrow(
      expect.objectContaining({
        refusal: { reason: 'organization-not-found' },
      }) as AccessRequestRefusal,
    );
    expect(store.attemptsOf(CAMILLE)).toEqual([]);
    expect(targets.calls).toEqual([]);
  });

  it('answers organization-not-found in another organization', async () => {
    const { useCase } = wire();

    await expect(
      useCase.execute(askDirection({ organizationId: OTHER_ORGANIZATION })),
    ).rejects.toThrow(AccessRequestRefusal);
  });

  it('locks the membership, then serializes the requester, before it counts', async () => {
    const { store, members, useCase } = wire();

    await useCase.execute(askDirection());

    expect(members.calls).toEqual([`roleOf:${CAMILLE}:share`]);
    expect(store.calls.slice(0, 5)).toEqual([
      'attempts.serialize',
      'clock.now',
      'attempts.recent',
      'attempts.prune',
      'attempts.record',
    ]);
    expect(store.runs).toEqual(['read-write']);
  });
});
