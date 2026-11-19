import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  BACKLOG,
  CAMILLE,
  DESIGN,
  HUGO,
  InMemorySpaces,
  LEA,
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  TRANSACTION_INSTANT,
  UNKNOWN_LIST,
  backlogState,
  designState,
  listGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { RestoreArchivedListInput } from './restore-archived-list.input.js';
import { RestoreArchivedList } from './restore-archived-list.use-case.js';

/** A list of the private space "Design". */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/** Camille Martin, who archived the lists on 3 November. */
const BY_CAMILLE = { type: 'user', id: CAMILLE } as const;

/**
 * Builds the restoration of the archived Sprint 14 by Léa Petit, a member, as the tasks module asks
 * it when it restores CAD-482.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function restore(overrides: Partial<RestoreArchivedListInput> = {}): RestoreArchivedListInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: LEA,
    viewerRole: 'member',
    listId: SPRINT_14,
    ...overrides,
  };
}

/** Atelier Nord: Backlog and the archived Sprint 14 (version 4) in "Produit", "Maquettes" archived in "Design". */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState()],
    lists: [
      backlogState(),
      sprintState({ archivedAt: ARCHIVED_AT, archivedBy: BY_CAMILLE, version: 4 }),
      backlogState({
        id: MAQUETTES,
        spaceId: DESIGN,
        name: 'Maquettes',
        archivedAt: ARCHIVED_AT,
        archivedBy: BY_CAMILLE,
      }),
    ],
  });
}

describe('RestoreArchivedList: the archived list of a restored task comes back with it', () => {
  it('restores the list at the instant of the transaction, at the next version, and says so', async () => {
    const spaces = atelierNord();

    const output = await new RestoreArchivedList(spaces).execute(restore());

    expect(output).toEqual({ outcome: 'restored' });
    expect(spaces.lists.get(SPRINT_14)).toEqual(
      sprintState({ restoredAt: TRANSACTION_INSTANT, version: 5 }),
    );
  });

  it('appends list.unarchived by the member who restores the task', async () => {
    const spaces = atelierNord();

    await new RestoreArchivedList(spaces).execute(restore());

    expect(spaces.events).toEqual([
      {
        kind: 'listUnarchived',
        listId: SPRINT_14,
        version: 5,
        restoredAt: TRANSACTION_INSTANT,
        actor: { type: 'user', id: LEA },
      },
    ]);
  });

  it('locks the list, and reads no membership: the caller passes the role', async () => {
    const spaces = atelierNord();

    await new RestoreArchivedList(spaces).execute(restore());

    expect(spaces.journal).toEqual([`list ${SPRINT_14}`]);
  });

  it('lets the owner of a private space restore its list', async () => {
    const spaces = atelierNord();

    const output = await new RestoreArchivedList(spaces).execute(
      restore({ actorUserId: HUGO, listId: MAQUETTES }),
    );

    expect(output).toEqual({ outcome: 'restored' });
  });
});

describe('RestoreArchivedList: a live list, or a refusal, writes nothing', () => {
  it('answers not-archived for a live list, at the same version, with no event', async () => {
    const spaces = atelierNord();

    const output = await new RestoreArchivedList(spaces).execute(restore({ listId: BACKLOG }));

    expect(output).toEqual({ outcome: 'not-archived' });
    expect(spaces.lists.get(BACKLOG)).toEqual(backlogState());
    expect(spaces.events).toEqual([]);
  });

  it.each([
    ['a list that does not exist', { listId: UNKNOWN_LIST }],
    ['a list of a private space of another', { actorUserId: CAMILLE, viewerRole: 'owner' }],
    ['a list a guest has no grant of', { actorUserId: NADIA, viewerRole: 'guest' }],
  ] as const)(
    'answers not-found for %s',
    async (_why: string, overrides: Partial<RestoreArchivedListInput>) => {
      const spaces = atelierNord();

      const output = await new RestoreArchivedList(spaces).execute(
        restore({ listId: MAQUETTES, ...overrides }),
      );

      expect(output).toEqual({ outcome: 'not-found' });
      expect(spaces.events).toEqual([]);
    },
  );

  it('answers not-found for a list of another organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ organizationId: OTHER_ORGANIZATION })],
      lists: [
        sprintState({
          organizationId: OTHER_ORGANIZATION,
          archivedAt: ARCHIVED_AT,
          archivedBy: BY_CAMILLE,
        }),
      ],
    });

    const output = await new RestoreArchivedList(spaces).execute(restore());

    expect(output).toEqual({ outcome: 'not-found' });
  });

  it.each([['comment'], ['view']] as const)(
    'answers role-insufficient with the role %s, and leaves the list archived',
    async (role: 'comment' | 'view') => {
      const spaces = new InMemorySpaces({
        spaces: [spaceState()],
        lists: [
          sprintState({
            archivedAt: ARCHIVED_AT,
            archivedBy: BY_CAMILLE,
            organizationAccess: false,
            version: 4,
          }),
        ],
        grants: [listGrantOf(PRODUIT, SPRINT_14, LEA, role)],
      });

      const output = await new RestoreArchivedList(spaces).execute(restore());

      expect(output).toEqual({ outcome: 'role-insufficient', role });
      expect(spaces.lists.get(SPRINT_14)?.archivedAt).toEqual(ARCHIVED_AT);
      expect(spaces.events).toEqual([]);
    },
  );
});
