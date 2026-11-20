import { describe, expect, it } from 'vitest';

import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import {
  ATELIER_NORD,
  CAMILLE,
  HUGO,
  InMemorySpaces,
  LEA,
  PRODUIT,
  SPRINT_14,
  atelierNordMembers,
  listGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import { CreateList } from '../create-list/create-list.use-case.js';
import { CreateListCopy } from './create-list-copy.use-case.js';

/** Lets the ordinary create operation join the parent use case's fake transaction. */
function joinTransactions(spaces: InMemorySpaces): SpacesUnitOfWork {
  let held: SpacesStore | undefined;
  return {
    async run<Result>(work: (store: SpacesStore) => Promise<Result>): Promise<Result> {
      if (held !== undefined) return work(held);
      return spaces.run(async (store: SpacesStore): Promise<Result> => {
        held = store;
        try {
          return await work(store);
        } finally {
          held = undefined;
        }
      });
    },
  };
}

function fixture() {
  const spaces = new InMemorySpaces({
    spaces: [spaceState()],
    lists: [sprintState({ organizationAccess: false, name: '😀'.repeat(80) })],
    grants: [
      listGrantOf(PRODUIT, SPRINT_14, HUGO, 'edit'),
      listGrantOf(PRODUIT, SPRINT_14, LEA, 'view'),
    ],
  });
  const members = atelierNordMembers();
  const transaction = joinTransactions(spaces);
  return {
    spaces,
    useCase: new CreateListCopy(transaction, members, new CreateList(transaction, members)),
  };
}

describe('CreateListCopy', () => {
  it('creates only a fresh grant for the initiating editor that would lose inherited access', async () => {
    const { spaces, useCase } = fixture();
    const copied = await useCase.execute({
      organizationId: ATELIER_NORD,
      actorUserId: HUGO,
      sourceListId: SPRINT_14,
    });
    expect(copied).toMatchObject({
      organizationAccess: false,
      callerRole: 'edit',
      version: 2,
      sprint: null,
      name: '😀'.repeat(72) + ' (copie)',
    });
    expect(spaces.events).toMatchObject([
      { kind: 'listCreated', listId: copied.id },
      {
        kind: 'listAccessChanged',
        listId: copied.id,
        version: 2,
        grants: [{ userId: HUGO, role: 'edit' }],
      },
    ]);
    const grants = await spaces.run((store: SpacesStore) =>
      store.grants.listOf(ATELIER_NORD, { kind: 'list', spaceId: PRODUIT, listId: copied.id }),
    );
    expect(grants.map(({ userId, role }) => [userId, role])).toEqual([[HUGO, 'edit']]);
  });

  it('leaves the copy at version one when the creator inherits edit', async () => {
    const { spaces, useCase } = fixture();
    const copied = await useCase.execute({
      organizationId: ATELIER_NORD,
      actorUserId: CAMILLE,
      sourceListId: SPRINT_14,
    });
    expect(copied).toMatchObject({ version: 1, callerRole: 'edit', organizationAccess: false });
    expect(spaces.events).toMatchObject([{ kind: 'listCreated', listId: copied.id }]);
  });
});
