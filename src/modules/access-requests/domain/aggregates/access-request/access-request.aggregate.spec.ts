import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BUDGET,
  CAMILLE,
  DECIDED_AT,
  DIR_12,
  DIRECTION,
  HUGO,
  LEA,
  listRequestState,
  spaceRequestState,
  taskRequestState,
} from '../../access-requests.fixture.js';
import { AccessRequestDecidedError } from '../../errors/access-request/access-request-decided.error.js';
import { InvalidAccessRequestError } from '../../errors/access-request/invalid-access-request.error.js';
import type { AccessRole } from '../../value-objects/access/access-role.value-object.js';
import type { NewAccessRequest } from '../../value-objects/access-request/new-access-request.value-object.js';
import { AccessRequest } from './access-request.aggregate.js';

/** Léa Petit, who answers. */
const BY_LEA = { type: 'user', id: LEA } as const;

/**
 * The request of Camille Martin for "Direction", as the application resolved it.
 *
 * @param overrides - Members to replace.
 * @returns The new request.
 */
function askForDirection(overrides: Partial<NewAccessRequest> = {}): NewAccessRequest {
  return {
    organizationId: ATELIER_NORD,
    target: 'space',
    spaceId: DIRECTION,
    listId: null,
    taskId: null,
    taskKey: null,
    requesterUserId: CAMILLE,
    message: 'Je dois chiffrer la part outillage du budget 2027.',
    ...overrides,
  };
}

describe('AccessRequest.ask: a request names exactly one target', () => {
  it('names the space of a space request as its target', () => {
    const draft = AccessRequest.ask(askForDirection());

    expect(draft).toEqual({
      organizationId: ATELIER_NORD,
      target: 'space',
      targetId: DIRECTION,
      spaceId: DIRECTION,
      listId: null,
      taskId: null,
      taskKey: null,
      requesterUserId: CAMILLE,
      message: 'Je dois chiffrer la part outillage du budget 2027.',
    });
  });

  it('names the list of a list request as its target', () => {
    const draft = AccessRequest.ask(
      askForDirection({ target: 'list', listId: BUDGET, requesterUserId: HUGO }),
    );

    expect(draft).toMatchObject({ target: 'list', targetId: BUDGET, listId: BUDGET });
  });

  it('names the task of a task request, with the list it is in and its key', () => {
    const draft = AccessRequest.ask(
      askForDirection({ target: 'task', listId: BUDGET, taskId: DIR_12, taskKey: 'DIR-12' }),
    );

    expect(draft).toMatchObject({
      target: 'task',
      targetId: DIR_12,
      listId: BUDGET,
      taskId: DIR_12,
      taskKey: 'DIR-12',
    });
  });

  it('refuses a space request that also names a list', () => {
    expect(() => AccessRequest.ask(askForDirection({ listId: BUDGET }))).toThrow(
      InvalidAccessRequestError,
    );
  });

  it('refuses a list request without its list, or with a task', () => {
    expect(() => AccessRequest.ask(askForDirection({ target: 'list' }))).toThrow(
      InvalidAccessRequestError,
    );
    expect(() =>
      AccessRequest.ask(askForDirection({ target: 'list', listId: BUDGET, taskId: DIR_12 })),
    ).toThrow(InvalidAccessRequestError);
  });

  it('refuses a task request without its list or with a malformed key', () => {
    expect(() =>
      AccessRequest.ask(askForDirection({ target: 'task', taskId: DIR_12, taskKey: 'DIR-12' })),
    ).toThrow(InvalidAccessRequestError);
    expect(() =>
      AccessRequest.ask(
        askForDirection({ target: 'task', listId: BUDGET, taskId: DIR_12, taskKey: 'dir-12' }),
      ),
    ).toThrow(InvalidAccessRequestError);
  });

  it('refuses a request without requester or organization', () => {
    expect(() => AccessRequest.ask(askForDirection({ requesterUserId: '' }))).toThrow(
      InvalidAccessRequestError,
    );
    expect(() => AccessRequest.ask(askForDirection({ organizationId: '' }))).toThrow(
      InvalidAccessRequestError,
    );
  });
});

describe('AccessRequest.ask: the message is trimmed, empty is none, 500 characters at most', () => {
  it('trims the message', () => {
    expect(AccessRequest.ask(askForDirection({ message: '  Budget 2027  ' })).message).toBe(
      'Budget 2027',
    );
  });

  it('stores an empty or blank message as none', () => {
    expect(AccessRequest.ask(askForDirection({ message: '' })).message).toBeNull();
    expect(AccessRequest.ask(askForDirection({ message: ' \n\t ' })).message).toBeNull();
    expect(AccessRequest.ask(askForDirection({ message: null })).message).toBeNull();
  });

  it('keeps a message of 500 characters, counted in code points, and refuses 501', () => {
    expect(AccessRequest.ask(askForDirection({ message: '😀'.repeat(500) })).message).toHaveLength(
      1000,
    );
    expect(() => AccessRequest.ask(askForDirection({ message: 'a'.repeat(501) }))).toThrow(
      InvalidAccessRequestError,
    );
  });

  it('counts the length once trimmed', () => {
    expect(
      AccessRequest.ask(askForDirection({ message: ` ${'a'.repeat(500)} ` })).message,
    ).toHaveLength(500);
  });
});

describe('AccessRequest: pending, then approved with a role or refused, once', () => {
  it('approves a pending request with the role, the instant and the actor, at version 2', () => {
    const pending = AccessRequest.restore(spaceRequestState());

    const approved = pending.approve('view', BY_LEA, DECIDED_AT);

    expect(pending.version).toBe(1);
    expect(approved.version).toBe(2);
    expect(approved.snapshot).toEqual(
      spaceRequestState({
        status: 'approved',
        role: 'view',
        decidedAt: DECIDED_AT,
        decidedBy: BY_LEA,
      }),
    );
  });

  it('refuses a pending request without a role', () => {
    const refused = AccessRequest.restore(taskRequestState()).refuse(BY_LEA, DECIDED_AT);

    expect(refused.snapshot).toMatchObject({
      status: 'refused',
      role: null,
      decidedAt: DECIDED_AT,
      decidedBy: BY_LEA,
    });
    expect(refused.version).toBe(2);
  });

  it('refuses a second answer with the status of the first', () => {
    const approved = AccessRequest.restore(spaceRequestState()).approve('edit', BY_LEA, DECIDED_AT);
    const refused = AccessRequest.restore(spaceRequestState()).refuse(BY_LEA, DECIDED_AT);

    expect(() => approved.refuse(BY_LEA, DECIDED_AT)).toThrow(
      expect.objectContaining({ status: 'approved' }) as AccessRequestDecidedError,
    );
    expect(() => refused.approve('view', BY_LEA, DECIDED_AT)).toThrow(AccessRequestDecidedError);
    expect(() => refused.refuse(BY_LEA, DECIDED_AT)).toThrow(
      expect.objectContaining({ status: 'refused' }) as AccessRequestDecidedError,
    );
  });

  it('refuses a role outside the three of the contract', () => {
    const pending = AccessRequest.restore(spaceRequestState());

    expect(() => pending.approve('owner' as AccessRole, BY_LEA, DECIDED_AT)).toThrow(
      InvalidAccessRequestError,
    );
  });

  it('leaves the pending request as it was', () => {
    const pending = AccessRequest.restore(spaceRequestState());

    pending.approve('view', BY_LEA, DECIDED_AT);

    expect(pending.snapshot).toEqual(spaceRequestState());
  });
});

describe('AccessRequest.grantTarget: a task request is approved as a grant of its list', () => {
  it('grants the space of a space request', () => {
    expect(AccessRequest.restore(spaceRequestState()).grantTarget).toEqual({
      kind: 'space',
      spaceId: DIRECTION,
    });
  });

  it('grants the list of a list request', () => {
    expect(AccessRequest.restore(listRequestState()).grantTarget).toEqual({
      kind: 'list',
      listId: BUDGET,
    });
  });

  it('grants the list the task was in when asked for', () => {
    expect(AccessRequest.restore(taskRequestState()).grantTarget).toEqual({
      kind: 'list',
      listId: BUDGET,
    });
  });
});

describe('AccessRequest.restore: a stored state no request can produce is a defect', () => {
  it('restores the three kinds of requests, pending and answered', () => {
    expect(() => AccessRequest.restore(spaceRequestState())).not.toThrow();
    expect(() => AccessRequest.restore(listRequestState())).not.toThrow();
    expect(() =>
      AccessRequest.restore(
        taskRequestState({
          status: 'refused',
          decidedAt: DECIDED_AT,
          decidedBy: BY_LEA,
        }),
      ),
    ).not.toThrow();
  });

  it('refuses a target id that is not the id of the target', () => {
    expect(() => AccessRequest.restore(spaceRequestState({ targetId: BUDGET }))).toThrow(
      InvalidAccessRequestError,
    );
  });

  it('refuses a role without approval and an approval without role', () => {
    expect(() => AccessRequest.restore(spaceRequestState({ role: 'view' }))).toThrow(
      InvalidAccessRequestError,
    );
    expect(() =>
      AccessRequest.restore(
        spaceRequestState({ status: 'approved', decidedAt: DECIDED_AT, decidedBy: BY_LEA }),
      ),
    ).toThrow(InvalidAccessRequestError);
  });

  it('refuses a pending request with a decision, and an answer without one', () => {
    expect(() => AccessRequest.restore(spaceRequestState({ decidedAt: DECIDED_AT }))).toThrow(
      InvalidAccessRequestError,
    );
    expect(() => AccessRequest.restore(spaceRequestState({ status: 'refused' }))).toThrow(
      InvalidAccessRequestError,
    );
  });

  it('refuses a message that is not trimmed', () => {
    expect(() => AccessRequest.restore(spaceRequestState({ message: ' Budget ' }))).toThrow(
      InvalidAccessRequestError,
    );
  });
});
