import { describe, expect, it } from 'vitest';

import type { AccessRequestState } from '../../../../../domain/value-objects/access-request/access-request-state.value-object.js';
import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import {
  ATELIER_NORD,
  CAMILLE,
  DECIDED_AT,
  FakeMembers,
  HUGO,
  InMemoryAccessRequests,
  LEA,
  LIST_REQUEST,
  NOW,
  OTHER_ORGANIZATION,
  SPACE_REQUEST,
  TASK_REQUEST,
  listRequestState,
  spaceRequestState,
  taskRequestState,
} from '../../../access-requests.fixture.js';
import { DropMemberAccessRequests } from './drop-member-access-requests.use-case.js';

/** The clean-up of Hugo Dubois, who left Atelier Nord. */
const input = { organizationId: ATELIER_NORD, userId: HUGO } as const;

/**
 * Wires the use case on the fakes, Hugo Dubois removed from the copy unless said otherwise.
 *
 * @param store - The requests and attempts.
 * @param roles - Roles of the copy to change.
 * @returns The use case.
 */
function wire(
  store: InMemoryAccessRequests,
  roles: Readonly<Record<string, MemberRole | null>> = { [HUGO]: null },
): DropMemberAccessRequests {
  return new DropMemberAccessRequests(store, new FakeMembers(roles));
}

/**
 * A pending request of Hugo Dubois for a list, numbered for its id.
 *
 * @param index - Which request.
 * @returns The state.
 */
function pendingOfHugo(index: number): AccessRequestState {
  const id = `019a7007-0000-7000-8000-${String(index).padStart(12, '0')}`;
  return listRequestState({ id, targetId: id, listId: id });
}

describe('DropMemberAccessRequests: one batch drops the pending requests of a former member', () => {
  it('deletes the pending requests of Hugo Dubois and keeps those of the others', async () => {
    const store = new InMemoryAccessRequests([
      spaceRequestState(),
      listRequestState(),
      taskRequestState(),
    ]);

    const output = await wire(store).execute(input);

    expect(output).toEqual({ outcome: 'dropped', dropped: 2 });
    expect([...store.requests.keys()]).toEqual([SPACE_REQUEST]);
  });

  it('keeps the answered requests of the former member', async () => {
    const answered = listRequestState({
      status: 'refused',
      decidedAt: DECIDED_AT,
      decidedBy: { type: 'user', id: LEA },
    });
    const store = new InMemoryAccessRequests([answered, taskRequestState()]);

    const output = await wire(store).execute(input);

    expect(output).toEqual({ outcome: 'dropped', dropped: 1 });
    expect([...store.requests.keys()]).toEqual([LIST_REQUEST]);
  });

  it('deletes the attempts of the former member only', async () => {
    const store = new InMemoryAccessRequests(
      [taskRequestState()],
      [
        { userId: HUGO, at: NOW },
        { userId: CAMILLE, at: NOW },
      ],
    );

    await wire(store).execute(input);

    expect(store.attemptsOf(HUGO)).toEqual([]);
    expect(store.attemptsOf(CAMILLE)).toEqual([NOW]);
  });

  it('drops at most 500 requests per batch, in id order, and the next batch goes on', async () => {
    const store = new InMemoryAccessRequests(
      Array.from({ length: 501 }, (_, index) => pendingOfHugo(index + 1)),
    );
    const useCase = wire(store);

    const first = await useCase.execute(input);
    const second = await useCase.execute(input);
    const third = await useCase.execute(input);

    expect(first).toEqual({ outcome: 'dropped', dropped: 500 });
    expect(second).toEqual({ outcome: 'dropped', dropped: 1 });
    expect(third).toEqual({ outcome: 'none-left' });
    expect(store.requests.size).toBe(0);
  });

  it('answers none-left, and still deletes the attempts, when nothing is pending', async () => {
    const store = new InMemoryAccessRequests([], [{ userId: HUGO, at: NOW }]);

    const output = await wire(store).execute(input);

    expect(output).toEqual({ outcome: 'none-left' });
    expect(store.attemptsOf(HUGO)).toEqual([]);
  });

  it('emits no event', async () => {
    const store = new InMemoryAccessRequests([taskRequestState()]);

    await wire(store).execute(input);

    expect(store.events).toEqual([]);
  });

  it('leaves the requests of the same account in another organization', async () => {
    const elsewhere = taskRequestState({ organizationId: OTHER_ORGANIZATION });
    const store = new InMemoryAccessRequests([elsewhere]);

    const output = await wire(store).execute(input);

    expect(output).toEqual({ outcome: 'none-left' });
    expect(store.requests.get(TASK_REQUEST)).toEqual(elsewhere);
  });
});

describe('DropMemberAccessRequests: nothing changes while the copy holds the account again', () => {
  it('answers member-again and writes nothing, after it locked the requests', async () => {
    const store = new InMemoryAccessRequests(
      [listRequestState(), taskRequestState()],
      [{ userId: HUGO, at: NOW }],
    );

    const output = await wire(store, {}).execute(input);

    expect(output).toEqual({ outcome: 'member-again' });
    expect(store.requests.size).toBe(2);
    expect(store.attemptsOf(HUGO)).toEqual([NOW]);
    expect(store.calls).toEqual(['requests.lockPendingOf']);
  });

  it('answers member-again for a guest too', async () => {
    const store = new InMemoryAccessRequests([listRequestState()]);

    const output = await wire(store, { [HUGO]: 'guest' }).execute(input);

    expect(output).toEqual({ outcome: 'member-again' });
  });
});
