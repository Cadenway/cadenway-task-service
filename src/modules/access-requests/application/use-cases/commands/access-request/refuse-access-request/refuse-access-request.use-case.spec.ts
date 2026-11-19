import { describe, expect, it } from 'vitest';

import type { AccessRequestState } from '../../../../../domain/value-objects/access-request/access-request-state.value-object.js';
import type { AccessRequestRefusal } from '../../../../models/access-request/access-request-refusal.model.js';
import type { AccessRequestRefusalReason } from '../../../../models/access-request/access-request-refusal-reason.model.js';
import {
  ATELIER_NORD,
  BUDGET,
  DECIDED_AT,
  FakeAccessTargets,
  FakeMembers,
  FakeTaskReferences,
  INES,
  InMemoryAccessRequests,
  LEA,
  LIST_REQUEST,
  NOW,
  TASK_REQUEST,
  UNKNOWN_REQUEST,
  listRequestState,
  spaceRequestState,
  taskRequestState,
} from '../../../access-requests.fixture.js';
import type { RefuseAccessRequestInput } from './refuse-access-request.input.js';
import { RefuseAccessRequest } from './refuse-access-request.use-case.js';

/** The fakes of one spec. */
interface Wiring {
  // #region Properties
  /** The requests. */
  readonly store: InMemoryAccessRequests;

  /** The spaces module. */
  readonly targets: FakeAccessTargets;

  /** The use case. */
  readonly useCase: RefuseAccessRequest;
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
  return {
    store,
    targets,
    useCase: new RefuseAccessRequest(store, new FakeMembers(), targets, new FakeTaskReferences()),
  };
}

/**
 * Léa Petit refuses the request of Hugo Dubois for DIR-12.
 *
 * @param overrides - Members to replace.
 * @returns The input.
 */
function refusal(overrides: Partial<RefuseAccessRequestInput> = {}): RefuseAccessRequestInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: LEA,
    accessRequestId: TASK_REQUEST,
    ...overrides,
  };
}

/**
 * The refusal a rejection carries.
 *
 * @param reason - The expected reason.
 * @returns A matcher of the refusal.
 */
function refusedWith(reason: AccessRequestRefusalReason): AccessRequestRefusal {
  return expect.objectContaining({ refusal: reason }) as AccessRequestRefusal;
}

describe('RefuseAccessRequest: the request is refused, nothing else changes', () => {
  it('answers the request refused, without role, with its task as it is now', async () => {
    const { useCase } = wire();

    const view = await useCase.execute(refusal());

    expect(view).toMatchObject({
      id: TASK_REQUEST,
      target: 'task',
      listId: BUDGET,
      task: { key: 'DIR-12', name: 'Budget 2027', status: 'progress' },
      status: 'refused',
      role: null,
      decidedAt: NOW,
      decidedBy: { type: 'user', id: LEA },
    });
  });

  it('stores the answer, appends task.access-request-decided at version 2 and grants nothing', async () => {
    const { store, targets, useCase } = wire();

    await useCase.execute(refusal());

    expect(store.requests.get(TASK_REQUEST)?.status).toBe('refused');
    expect(store.events).toEqual([
      {
        kind: 'accessRequestDecided',
        requestId: TASK_REQUEST,
        target: 'task',
        version: 2,
        status: 'refused',
        role: null,
        decidedById: LEA,
      },
    ]);
    expect(targets.grants).toEqual([]);
  });

  it('refuses a list request for whoever has edit on the list', async () => {
    const { targets, useCase } = wire();
    targets.allow(INES, BUDGET, 'edit');

    const view = await useCase.execute(
      refusal({ actorUserId: INES, accessRequestId: LIST_REQUEST }),
    );

    expect(view.status).toBe('refused');
  });
});

describe('RefuseAccessRequest: only the people who manage the target answer it, once', () => {
  it('answers access-request-not-found to a member who does not manage the list', async () => {
    const { store, useCase } = wire();

    await expect(useCase.execute(refusal({ actorUserId: INES }))).rejects.toThrow(
      refusedWith({ reason: 'access-request-not-found' }),
    );
    expect(store.requests.get(TASK_REQUEST)?.status).toBe('pending');
  });

  it('answers access-request-not-found for an unknown request', async () => {
    const { useCase } = wire();

    await expect(useCase.execute(refusal({ accessRequestId: UNKNOWN_REQUEST }))).rejects.toThrow(
      refusedWith({ reason: 'access-request-not-found' }),
    );
  });

  it('answers already-decided with how it was answered', async () => {
    const approved = taskRequestState({
      status: 'approved',
      role: 'view',
      decidedAt: DECIDED_AT,
      decidedBy: { type: 'user', id: LEA },
    });
    const { store, useCase } = wire([approved]);

    await expect(useCase.execute(refusal())).rejects.toThrow(
      refusedWith({ reason: 'already-decided', status: 'approved' }),
    );
    expect(store.events).toEqual([]);
  });
});
