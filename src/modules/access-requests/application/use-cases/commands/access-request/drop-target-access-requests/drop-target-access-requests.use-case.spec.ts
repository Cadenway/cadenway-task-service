import { describe, expect, it } from 'vitest';

import type { AccessRequestState } from '../../../../../domain/value-objects/access-request/access-request-state.value-object.js';
import {
  ATELIER_NORD,
  BUDGET,
  DECIDED_AT,
  DIR_12,
  DIRECTION,
  HUGO,
  InMemoryAccessRequests,
  LEA,
  LIST_REQUEST,
  NOW,
  OTHER_ORGANIZATION,
  PRODUIT,
  RECRUTEMENT,
  ROADMAP,
  SPACE_REQUEST,
  TASK_REQUEST,
  listRequestState,
  spaceRequestState,
  taskRequestState,
} from '../../../access-requests.fixture.js';
import type { DropTargetAccessRequestsInput } from './drop-target-access-requests.input.js';
import { DropTargetAccessRequests } from './drop-target-access-requests.use-case.js';

/** DIR-13 "Plan de recrutement", another task of "Direction". */
const DIR_13: string = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1a13';

/** The request of Hugo Dubois for "Recrutement", another list of "Direction". */
const RECRUTEMENT_REQUEST: string = '019a7007-8b9c-7d0e-8f1a-2b3c4d5e6f04';

/** The request of Hugo Dubois for "Roadmap" of "Produit". */
const ROADMAP_REQUEST: string = '019a7007-8b9c-7d0e-8f1a-2b3c4d5e6f05';

/** The request of Hugo Dubois for DIR-13. */
const DIR_13_REQUEST: string = '019a7007-8b9c-7d0e-8f1a-2b3c4d5e6f06';

/**
 * The requests of Atelier Nord: Camille Martin for "Direction", Hugo Dubois for "Budget",
 * "Recrutement", "Roadmap" of "Produit", DIR-12 and DIR-13.
 *
 * @returns The states.
 */
function requestsOfAtelierNord(): readonly AccessRequestState[] {
  return [
    spaceRequestState(),
    listRequestState(),
    listRequestState({ id: RECRUTEMENT_REQUEST, targetId: RECRUTEMENT, listId: RECRUTEMENT }),
    listRequestState({
      id: ROADMAP_REQUEST,
      targetId: ROADMAP,
      listId: ROADMAP,
      spaceId: PRODUIT,
    }),
    taskRequestState(),
    taskRequestState({ id: DIR_13_REQUEST, targetId: DIR_13, taskId: DIR_13, taskKey: 'DIR-13' }),
  ];
}

/**
 * The ids of the requests left in the store, sorted.
 *
 * @param store - The fake.
 * @returns The ids.
 */
function idsLeft(store: InMemoryAccessRequests): string[] {
  return [...store.requests.keys()].sort();
}

describe('DropTargetAccessRequests: the pending requests of a deleted target go', () => {
  it('drops the task requests of the tasks moved to the trash, and only them', async () => {
    const store = new InMemoryAccessRequests(requestsOfAtelierNord());

    const output = await new DropTargetAccessRequests(store).execute({
      organizationId: ATELIER_NORD,
      target: { kind: 'tasks', taskIds: [DIR_12] },
    });

    expect(output).toEqual({ dropped: 1 });
    expect(store.requests.has(TASK_REQUEST)).toBe(false);
    expect(store.requests.has(DIR_13_REQUEST)).toBe(true);
    expect(store.requests.size).toBe(5);
  });

  it('drops the list requests of a deleted list, and leaves the requests for its tasks to the job', async () => {
    const store = new InMemoryAccessRequests(requestsOfAtelierNord());

    const output = await new DropTargetAccessRequests(store).execute({
      organizationId: ATELIER_NORD,
      target: { kind: 'list', listId: BUDGET },
    });

    expect(output).toEqual({ dropped: 1 });
    expect(store.requests.has(LIST_REQUEST)).toBe(false);
    expect(store.requests.has(TASK_REQUEST)).toBe(true);
    expect(store.requests.has(RECRUTEMENT_REQUEST)).toBe(true);
  });

  it('drops the space requests of a deleted space, and leaves the list requests of its lists to each list', async () => {
    const store = new InMemoryAccessRequests(requestsOfAtelierNord());

    const output = await new DropTargetAccessRequests(store).execute({
      organizationId: ATELIER_NORD,
      target: { kind: 'space', spaceId: DIRECTION },
    });

    expect(output).toEqual({ dropped: 1 });
    expect(idsLeft(store)).toEqual(
      [LIST_REQUEST, RECRUTEMENT_REQUEST, ROADMAP_REQUEST, TASK_REQUEST, DIR_13_REQUEST].sort(),
    );
  });

  it('keeps the answered requests of the target, with their history', async () => {
    const refused = spaceRequestState({
      status: 'refused',
      decidedAt: DECIDED_AT,
      decidedBy: { type: 'user', id: LEA },
    });
    const store = new InMemoryAccessRequests([refused, listRequestState()]);

    const output = await new DropTargetAccessRequests(store).execute({
      organizationId: ATELIER_NORD,
      target: { kind: 'space', spaceId: DIRECTION },
    });

    expect(output).toEqual({ dropped: 0 });
    expect(store.requests.get(SPACE_REQUEST)).toEqual(refused);
    expect(store.requests.has(LIST_REQUEST)).toBe(true);
  });

  it('leaves the requests of another organization, whatever their target', async () => {
    const elsewhere = listRequestState({ organizationId: OTHER_ORGANIZATION });
    const store = new InMemoryAccessRequests([elsewhere]);

    const output = await new DropTargetAccessRequests(store).execute({
      organizationId: ATELIER_NORD,
      target: { kind: 'list', listId: BUDGET },
    });

    expect(output).toEqual({ dropped: 0 });
    expect(store.requests.get(LIST_REQUEST)).toEqual(elsewhere);
  });

  it('drops nothing the second time, so a job run again is harmless', async () => {
    const store = new InMemoryAccessRequests(requestsOfAtelierNord());
    const useCase = new DropTargetAccessRequests(store);
    const input: DropTargetAccessRequestsInput = {
      organizationId: ATELIER_NORD,
      target: { kind: 'space', spaceId: DIRECTION },
    };

    await useCase.execute(input);
    const again = await useCase.execute(input);

    expect(again).toEqual({ dropped: 0 });
  });

  it('runs one read-write transaction, emits no event and leaves the attempts', async () => {
    const store = new InMemoryAccessRequests([taskRequestState()], [{ userId: HUGO, at: NOW }]);

    await new DropTargetAccessRequests(store).execute({
      organizationId: ATELIER_NORD,
      target: { kind: 'tasks', taskIds: [DIR_12, DIR_13] },
    });

    expect(store.runs).toEqual(['read-write']);
    expect(store.calls).toEqual(['requests.deletePendingOf:tasks']);
    expect(store.events).toEqual([]);
    expect(store.attemptsOf(HUGO)).toEqual([NOW]);
  });
});

describe('DropTargetAccessRequests: the bound of one call', () => {
  it('accepts 2,000 tasks at once', async () => {
    const store = new InMemoryAccessRequests([taskRequestState()]);
    const taskIds = [DIR_12, ...Array.from({ length: 1_999 }, () => DIR_13)];

    await expect(
      new DropTargetAccessRequests(store).execute({
        organizationId: ATELIER_NORD,
        target: { kind: 'tasks', taskIds },
      }),
    ).resolves.toEqual({ dropped: 1 });
  });

  it('refuses more than 2,000 tasks before any statement, as a defect of the caller', async () => {
    const store = new InMemoryAccessRequests([taskRequestState()]);
    const taskIds = Array.from({ length: 2_001 }, () => DIR_12);

    await expect(
      new DropTargetAccessRequests(store).execute({
        organizationId: ATELIER_NORD,
        target: { kind: 'tasks', taskIds },
      }),
    ).rejects.toThrow('at most 2000 tasks');
    expect(store.runs).toEqual([]);
    expect(store.requests.has(TASK_REQUEST)).toBe(true);
  });

  it('rolls the deletion back when the transaction fails', async () => {
    const store = new InMemoryAccessRequests(requestsOfAtelierNord());
    const failing = new DropTargetAccessRequests({
      run: (work) =>
        store.run(async (transaction) => {
          await work(transaction);
          throw new Error('canceling statement due to lock timeout');
        }),
      runReadOnly: (work) => store.runReadOnly(work),
    });

    await expect(
      failing.execute({
        organizationId: ATELIER_NORD,
        target: { kind: 'space', spaceId: DIRECTION },
      }),
    ).rejects.toThrow('lock timeout');
    expect(store.requests.size).toBe(6);
  });
});
