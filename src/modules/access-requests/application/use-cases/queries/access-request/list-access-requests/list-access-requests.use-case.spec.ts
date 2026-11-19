import { describe, expect, it } from 'vitest';

import type { AccessRequestState } from '../../../../../domain/value-objects/access-request/access-request-state.value-object.js';
import type { AccessRequestRefusal } from '../../../../models/access-request/access-request-refusal.model.js';
import {
  ATELIER_NORD,
  BUDGET,
  CAMILLE,
  DECIDED_AT,
  DIRECTION,
  DIR_12_TASK,
  FakeAccessTargets,
  FakeMembers,
  FakeTaskReferences,
  HUGO,
  INES,
  InMemoryAccessRequests,
  LEA,
  LIST_REQUEST,
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
import type { ListAccessRequestsInput } from './list-access-requests.input.js';
import { ListAccessRequests } from './list-access-requests.use-case.js';

/** The fakes of one spec. */
interface Wiring {
  // #region Properties
  /** The requests. */
  readonly store: InMemoryAccessRequests;

  /** The spaces module. */
  readonly targets: FakeAccessTargets;

  /** The tasks module. */
  readonly tasks: FakeTaskReferences;

  /** The use case. */
  readonly useCase: ListAccessRequests;
  // #endregion
}

/**
 * Wires the use case on the fakes.
 *
 * @param requests - The stored requests.
 * @returns The fakes and the use case.
 */
function wire(
  requests: readonly AccessRequestState[] = [
    spaceRequestState(),
    listRequestState(),
    taskRequestState(),
  ],
): Wiring {
  const store = new InMemoryAccessRequests(requests);
  const targets = new FakeAccessTargets();
  const tasks = new FakeTaskReferences();
  return {
    store,
    targets,
    tasks,
    useCase: new ListAccessRequests(store, new FakeMembers(), targets, tasks),
  };
}

/**
 * Léa Petit reads the first page of her pending requests.
 *
 * @param overrides - Members to replace.
 * @returns The input.
 */
function page(overrides: Partial<ListAccessRequestsInput> = {}): ListAccessRequestsInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: LEA,
    spaceId: null,
    listId: null,
    after: null,
    limit: 50,
    ...overrides,
  };
}

describe('ListAccessRequests: the pending requests the actor answers, the most recent first', () => {
  it('lists the space, task and list requests of "Direction" to Léa Petit, newest first, with the total', async () => {
    const { useCase } = wire();

    const result = await useCase.execute(page());

    expect(result.items.map((item) => item.id)).toEqual([
      SPACE_REQUEST,
      TASK_REQUEST,
      LIST_REQUEST,
    ]);
    expect(result.total).toBe(3);
    expect(result.next).toBeNull();
  });

  it('names the task of a task request as it is now, from one batch', async () => {
    const { tasks, useCase } = wire();

    const result = await useCase.execute(page());

    expect(result.items.find((item) => item.id === TASK_REQUEST)?.task).toEqual({
      key: 'DIR-12',
      name: 'Budget 2027',
      status: 'progress',
    });
    expect(result.items.find((item) => item.id === SPACE_REQUEST)?.task).toBeNull();
    expect(tasks.calls).toEqual(['findByIds:1']);
  });

  it('leaves out a task request whose task is no longer found, from the page and the total', async () => {
    const { tasks, useCase } = wire();
    tasks.tasks = [];

    const result = await useCase.execute(page());

    expect(result.items.map((item) => item.id)).toEqual([SPACE_REQUEST, LIST_REQUEST]);
    expect(result.total).toBe(2);
  });

  it('leaves out the answered requests', async () => {
    const answered = spaceRequestState({
      status: 'refused',
      decidedAt: DECIDED_AT,
      decidedBy: { type: 'user', id: LEA },
    });
    const { useCase } = wire([answered, listRequestState()]);

    const result = await useCase.execute(page());

    expect(result.items.map((item) => item.id)).toEqual([LIST_REQUEST]);
    expect(result.total).toBe(1);
  });

  it('pages with the position of the last request, and gives the total on every page', async () => {
    const { useCase } = wire();

    const first = await useCase.execute(page({ limit: 2 }));
    const second = await useCase.execute(page({ limit: 2, after: first.next }));

    expect(first.items.map((item) => item.id)).toEqual([SPACE_REQUEST, TASK_REQUEST]);
    expect(first.next).toEqual({ createdAt: taskRequestState().createdAt, id: TASK_REQUEST });
    expect(second.items.map((item) => item.id)).toEqual([LIST_REQUEST]);
    expect(second.next).toBeNull();
    expect([first.total, second.total]).toEqual([3, 3]);
  });

  it('runs in a read-only transaction', async () => {
    const { store, useCase } = wire();

    await useCase.execute(page());

    expect(store.runs).toEqual(['read-only']);
  });
});

describe('ListAccessRequests: what each member answers', () => {
  it('lists the list and task requests of a list to whoever has edit on it, not the space request', async () => {
    const { targets, useCase } = wire();
    targets.allow(INES, BUDGET, 'edit');

    const result = await useCase.execute(page({ actorUserId: INES }));

    expect(result.items.map((item) => item.id)).toEqual([TASK_REQUEST, LIST_REQUEST]);
  });

  it('lists nothing to a member who sees the list without edit, and reads no request', async () => {
    const { store, targets, useCase } = wire();
    targets.allow(INES, BUDGET, 'view');

    const result = await useCase.execute(page({ actorUserId: INES }));

    expect(result).toEqual({ items: [], next: null, total: 0 });
    expect(store.calls).toEqual([]);
  });

  it('lists the space request to a manager of the space who has no edit on its lists', async () => {
    const { targets, useCase } = wire();
    targets.allow(CAMILLE, DIRECTION, 'edit', true);

    const result = await useCase.execute(page({ actorUserId: CAMILLE }));

    expect(result.items.map((item) => item.id)).toEqual([SPACE_REQUEST]);
  });

  it('answers organization-not-found to an account the copy does not hold', async () => {
    const { useCase } = wire();

    await expect(useCase.execute(page({ organizationId: OTHER_ORGANIZATION }))).rejects.toThrow(
      expect.objectContaining({
        refusal: { reason: 'organization-not-found' },
      }) as AccessRequestRefusal,
    );
  });
});

describe('ListAccessRequests: the filters', () => {
  it('keeps the requests of a space, its lists and their tasks with spaceId', async () => {
    const { useCase } = wire();

    const result = await useCase.execute(page({ spaceId: DIRECTION }));

    expect(result.total).toBe(3);
  });

  it('keeps the requests of a list and its tasks with listId, not those of the space', async () => {
    const { useCase } = wire([
      spaceRequestState(),
      listRequestState(),
      taskRequestState(),
      listRequestState({
        id: '019a7007-8b9c-7d0e-8f1a-2b3c4d5e6f04',
        targetId: RECRUTEMENT,
        listId: RECRUTEMENT,
        requesterUserId: CAMILLE,
      }),
    ]);

    const result = await useCase.execute(page({ listId: BUDGET }));

    expect(result.items.map((item) => item.id)).toEqual([TASK_REQUEST, LIST_REQUEST]);
    expect(result.total).toBe(2);
  });

  it('keeps only the requests of the lists the actor answers within a space they do not manage', async () => {
    const { targets, useCase } = wire();
    targets.allow(HUGO, BUDGET, 'edit');

    const result = await useCase.execute(page({ actorUserId: HUGO, spaceId: DIRECTION }));

    expect(result.items.map((item) => item.target)).toEqual(['task', 'list']);
  });
});

describe('ListAccessRequests: a task request is listed on the list its task is in now', () => {
  /** DIR-12, moved from "Budget" of "Direction" to "Roadmap" of "Produit". */
  const moved = { ...DIR_12_TASK, listId: ROADMAP, spaceId: PRODUIT } as const;

  it('lists a moved task request to whoever has edit on its new list, placed there', async () => {
    const { targets, tasks, useCase } = wire();
    tasks.tasks = [moved];
    targets.allow(INES, ROADMAP, 'edit');

    const result = await useCase.execute(page({ actorUserId: INES }));

    expect(result.items).toEqual([
      expect.objectContaining({ id: TASK_REQUEST, spaceId: PRODUIT, listId: ROADMAP }),
    ]);
    expect(result.total).toBe(1);
  });

  it('no longer lists a moved task request to the editors of the list it left', async () => {
    const { tasks, useCase } = wire();
    tasks.tasks = [moved];

    const result = await useCase.execute(page());

    expect(result.items.map((item) => item.id)).toEqual([SPACE_REQUEST, LIST_REQUEST]);
    expect(result.total).toBe(2);
  });

  it('filters a task request on the current space and list of its task', async () => {
    const { targets, tasks, useCase } = wire();
    tasks.tasks = [moved];
    targets.allow(INES, ROADMAP, 'edit');

    const inProduit = await useCase.execute(page({ actorUserId: INES, spaceId: PRODUIT }));
    const inDirection = await useCase.execute(page({ actorUserId: INES, spaceId: DIRECTION }));
    const inBudget = await useCase.execute(page({ actorUserId: INES, listId: BUDGET }));

    expect(inProduit.total).toBe(1);
    expect(inDirection.total).toBe(0);
    expect(inBudget.total).toBe(0);
  });

  it('reads no task request to a member who has edit on no list', async () => {
    const { store, targets, tasks, useCase } = wire();
    targets.allow(CAMILLE, DIRECTION, 'edit', true);

    await useCase.execute(page({ actorUserId: CAMILLE }));

    expect(store.calls).not.toContain('requests.listPendingTaskIds');
    expect(tasks.calls).toEqual([]);
  });

  it('locates the tasks of the pending task requests in chunks of 100', async () => {
    const requests = Array.from({ length: 150 }, (_, index) => {
      const suffix = String(index + 1).padStart(12, '0');
      return taskRequestState({
        id: `019a7007-2222-7000-8000-${suffix}`,
        targetId: `019a7002-2222-7000-8000-${suffix}`,
        taskId: `019a7002-2222-7000-8000-${suffix}`,
        taskKey: `DIR-${String(index + 100)}`,
      });
    });
    const { tasks, useCase } = wire(requests);
    tasks.tasks = requests.map((request) => ({
      ...DIR_12_TASK,
      id: request.taskId ?? '',
      key: request.taskKey ?? '',
    }));

    const result = await useCase.execute(page({ limit: 100 }));

    expect(tasks.calls).toEqual(['findByIds:100', 'findByIds:50']);
    expect(result.total).toBe(150);
    expect(result.items).toHaveLength(100);
  });
});
