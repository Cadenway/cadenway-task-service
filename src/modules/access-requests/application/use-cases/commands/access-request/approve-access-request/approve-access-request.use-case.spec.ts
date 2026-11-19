import { describe, expect, it } from 'vitest';

import type { AccessRequestState } from '../../../../../domain/value-objects/access-request/access-request-state.value-object.js';
import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import type { AccessRequestRefusal } from '../../../../models/access-request/access-request-refusal.model.js';
import type { AccessRequestRefusalReason } from '../../../../models/access-request/access-request-refusal-reason.model.js';
import type { GrantOutcome } from '../../../../models/grant/grant-outcome.model.js';
import {
  ATELIER_NORD,
  BUDGET,
  CAMILLE,
  DECIDED_AT,
  DIRECTION,
  FakeAccessTargets,
  FakeMembers,
  FakeTaskReferences,
  HUGO,
  INES,
  InMemoryAccessRequests,
  LEA,
  NOW,
  SPACE_REQUEST,
  TASK_REQUEST,
  UNKNOWN_REQUEST,
  listRequestState,
  spaceRequestState,
  taskRequestState,
} from '../../../access-requests.fixture.js';
import type { ApproveAccessRequestInput } from './approve-access-request.input.js';
import { ApproveAccessRequest } from './approve-access-request.use-case.js';

/** The fakes of one spec. */
interface Wiring {
  // #region Properties
  /** The requests. */
  readonly store: InMemoryAccessRequests;

  /** The copy of the memberships. */
  readonly members: FakeMembers;

  /** The spaces module. */
  readonly targets: FakeAccessTargets;

  /** The use case. */
  readonly useCase: ApproveAccessRequest;
  // #endregion
}

/**
 * Wires the use case on the fakes, with the three requests of the fixture.
 *
 * @param requests - The stored requests.
 * @param roles - Roles of the copy to change.
 * @returns The fakes and the use case.
 */
function wire(
  requests: readonly AccessRequestState[] = [
    spaceRequestState(),
    listRequestState(),
    taskRequestState(),
  ],
  roles: Readonly<Record<string, MemberRole | null>> = {},
): Wiring {
  const store = new InMemoryAccessRequests(requests);
  const members = new FakeMembers(roles);
  const targets = new FakeAccessTargets();
  return {
    store,
    members,
    targets,
    useCase: new ApproveAccessRequest(store, members, targets, new FakeTaskReferences()),
  };
}

/**
 * Léa Petit approves the request of Camille Martin for "Direction" with `view`.
 *
 * @param overrides - Members to replace.
 * @returns The input.
 */
function approval(overrides: Partial<ApproveAccessRequestInput> = {}): ApproveAccessRequestInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: LEA,
    accessRequestId: SPACE_REQUEST,
    role: 'view',
    ...overrides,
  };
}

/**
 * The refusal a rejection carries.
 *
 * @param refusal - The expected reason.
 * @returns A matcher of the refusal.
 */
function refusedWith(refusal: AccessRequestRefusalReason): AccessRequestRefusal {
  return expect.objectContaining({ refusal }) as AccessRequestRefusal;
}

describe('ApproveAccessRequest: the requester receives the grant, and the request is approved', () => {
  it('grants the space of a space request with the role, by Léa Petit', async () => {
    const { targets, useCase } = wire();

    await useCase.execute(approval());

    expect(targets.grants).toEqual([
      {
        organizationId: ATELIER_NORD,
        actorUserId: LEA,
        target: { kind: 'space', spaceId: DIRECTION },
        granteeUserId: CAMILLE,
        role: 'view',
      },
    ]);
  });

  it('answers the request approved, with the role, the instant and the actor', async () => {
    const { useCase } = wire();

    const view = await useCase.execute(approval());

    expect(view).toEqual({
      id: SPACE_REQUEST,
      target: 'space',
      spaceId: DIRECTION,
      listId: null,
      task: null,
      requesterUserId: CAMILLE,
      message: 'Je dois chiffrer la part outillage du budget 2027.',
      status: 'approved',
      role: 'view',
      createdAt: spaceRequestState().createdAt,
      decidedAt: NOW,
      decidedBy: { type: 'user', id: LEA },
    });
  });

  it('stores the answer and appends space.access-request-decided at version 2', async () => {
    const { store, useCase } = wire();

    await useCase.execute(approval({ role: 'comment' }));

    expect(store.requests.get(SPACE_REQUEST)).toMatchObject({
      status: 'approved',
      role: 'comment',
      decidedAt: NOW,
    });
    expect(store.events).toEqual([
      {
        kind: 'accessRequestDecided',
        requestId: SPACE_REQUEST,
        target: 'space',
        version: 2,
        status: 'approved',
        role: 'comment',
        decidedById: LEA,
      },
    ]);
  });

  it('approves a task request as a grant of the list it was in, and names the task as it is now', async () => {
    const { targets, useCase } = wire();

    const view = await useCase.execute(approval({ accessRequestId: TASK_REQUEST, role: 'edit' }));

    expect(targets.grants[0]).toMatchObject({
      target: { kind: 'list', listId: BUDGET },
      granteeUserId: HUGO,
      role: 'edit',
    });
    expect(view.task).toEqual({ key: 'DIR-12', name: 'Budget 2027', status: 'progress' });
    expect(view.listId).toBe(BUDGET);
  });

  it('approves when the requester already holds a higher grant: the grant is kept, never lowered', async () => {
    const { store, targets, useCase } = wire();
    targets.grantOutcome = { outcome: 'granted', changed: false };

    const view = await useCase.execute(approval({ role: 'view' }));

    expect(targets.grants.map((grant) => grant.role)).toEqual(['view']);
    expect(view.status).toBe('approved');
    expect(store.events.map((event) => event.kind)).toEqual(['accessRequestDecided']);
  });
});

describe('ApproveAccessRequest: only the people who manage the target answer it', () => {
  it('answers access-request-not-found to a member who does not manage the space', async () => {
    const { store, targets, useCase } = wire();

    await expect(useCase.execute(approval({ actorUserId: INES }))).rejects.toThrow(
      refusedWith({ reason: 'access-request-not-found' }),
    );
    expect(targets.grants).toEqual([]);
    expect(store.requests.get(SPACE_REQUEST)?.status).toBe('pending');
  });

  it('answers access-request-not-found to a member who sees the list without edit', async () => {
    const { targets, useCase } = wire();
    targets.allow(INES, BUDGET, 'comment');

    await expect(
      useCase.execute(approval({ actorUserId: INES, accessRequestId: TASK_REQUEST })),
    ).rejects.toThrow(refusedWith({ reason: 'access-request-not-found' }));
  });

  it('answers access-request-not-found to a non-manager for a decided request too', async () => {
    const decided = spaceRequestState({
      status: 'refused',
      decidedAt: DECIDED_AT,
      decidedBy: { type: 'user', id: LEA },
    });
    const { useCase } = wire([decided]);

    await expect(useCase.execute(approval({ actorUserId: INES }))).rejects.toThrow(
      refusedWith({ reason: 'access-request-not-found' }),
    );
  });

  it('answers access-request-not-found for an unknown request', async () => {
    const { useCase } = wire();

    await expect(useCase.execute(approval({ accessRequestId: UNKNOWN_REQUEST }))).rejects.toThrow(
      refusedWith({ reason: 'access-request-not-found' }),
    );
  });

  it('answers organization-not-found to an account the copy does not hold', async () => {
    const { useCase } = wire(undefined, { [LEA]: null });

    await expect(useCase.execute(approval())).rejects.toThrow(
      refusedWith({ reason: 'organization-not-found' }),
    );
  });

  it('locks the membership, then the request, then reads the target', async () => {
    const { members, store, targets, useCase } = wire();

    await useCase.execute(approval());

    expect(members.calls).toEqual([`roleOf:${LEA}:share`]);
    expect(store.calls[0]).toBe(`requests.lock:${SPACE_REQUEST}`);
    expect(targets.calls).toEqual([`find:space:${DIRECTION}`, 'grant:space']);
  });
});

describe('ApproveAccessRequest: a request changes once', () => {
  it('answers already-decided with how it was answered, and grants nothing', async () => {
    const refused = spaceRequestState({
      status: 'refused',
      decidedAt: DECIDED_AT,
      decidedBy: { type: 'user', id: LEA },
    });
    const { store, targets, useCase } = wire([refused]);

    await expect(useCase.execute(approval())).rejects.toThrow(
      refusedWith({ reason: 'already-decided', status: 'refused' }),
    );
    expect(targets.grants).toEqual([]);
    expect(store.events).toEqual([]);
  });

  it('answers already-decided to a second approval', async () => {
    const { useCase } = wire();
    await useCase.execute(approval());

    await expect(useCase.execute(approval({ role: 'edit' }))).rejects.toThrow(
      refusedWith({ reason: 'already-decided', status: 'approved' }),
    );
  });
});

describe('ApproveAccessRequest: a refused grant refuses the approval and changes nothing', () => {
  const cases: readonly [GrantOutcome, AccessRequestRefusalReason][] = [
    [
      { outcome: 'refused', reason: 'grantee-invalid' },
      { reason: 'grantee-invalid', userId: CAMILLE },
    ],
    [{ outcome: 'refused', reason: 'guest-space-forbidden' }, { reason: 'guest-space-forbidden' }],
    [{ outcome: 'refused', reason: 'owner-unchangeable' }, { reason: 'owner-unchangeable' }],
    [{ outcome: 'refused', reason: 'grant-limit-reached' }, { reason: 'grant-limit-reached' }],
    [{ outcome: 'refused', reason: 'not-found' }, { reason: 'access-request-not-found' }],
  ];

  for (const [outcome, refusal] of cases) {
    it(`answers ${refusal.reason} when the grant is refused for ${outcome.outcome === 'refused' ? outcome.reason : ''}`, async () => {
      const { store, targets, useCase } = wire();
      targets.grantOutcome = outcome;

      await expect(useCase.execute(approval())).rejects.toThrow(refusedWith(refusal));
      expect(store.requests.get(SPACE_REQUEST)?.status).toBe('pending');
      expect(store.events).toEqual([]);
    });
  }
});
