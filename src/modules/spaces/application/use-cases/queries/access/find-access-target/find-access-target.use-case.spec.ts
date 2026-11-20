import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  DESIGN,
  HUGO,
  INES,
  InMemorySpaces,
  LEA,
  NADIA,
  PRODUIT,
  SPRINT_14,
  UNKNOWN_LIST,
  UNKNOWN_SPACE,
  designState,
  listGrantOf,
  spaceGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { FindAccessTargetInput } from './find-access-target.input.js';
import { FindAccessTarget } from './find-access-target.use-case.js';

/**
 * Builds Léa Petit, a member, looking at the private space Design.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function find(overrides: Partial<FindAccessTargetInput> = {}): FindAccessTargetInput {
  return {
    organizationId: ATELIER_NORD,
    viewerUserId: LEA,
    viewerRole: 'member',
    target: { kind: 'space', spaceId: DESIGN },
    ...overrides,
  };
}

/** Produit with Sprint 14 (switch off) shared with Nadia Benali; the private Design shared with Inès Robert. */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState()],
    lists: [sprintState({ organizationAccess: false })],
    grants: [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'edit'), spaceGrantOf(DESIGN, INES, 'comment')],
  });
}

describe('FindAccessTarget: the target of an access request, seen or not', () => {
  it('finds a private space the member does not see, with its owner and no role', async () => {
    const target = await new FindAccessTarget(atelierNord()).execute(find());

    expect(target).toEqual({
      kind: 'space',
      spaceId: DESIGN,
      spaceName: 'Design',
      spaceOwnerUserId: HUGO,
      listId: null,
      listName: null,
      viewerRole: null,
      viewerManages: false,
    });
  });

  it('answers the role of the grant of a space, which does not make its holder manage it', async () => {
    const target = await new FindAccessTarget(atelierNord()).execute(
      find({ viewerUserId: INES, viewerRole: 'admin' }),
    );

    expect(target).toMatchObject({ viewerRole: 'comment', viewerManages: false });
  });

  it('answers that the owner of the space manages it', async () => {
    const target = await new FindAccessTarget(atelierNord()).execute(find({ viewerUserId: HUGO }));

    expect(target).toMatchObject({ viewerRole: 'edit', viewerManages: true });
  });

  it('finds a list with the role on the list, and answers whether the member has edit there', async () => {
    const finder = new FindAccessTarget(atelierNord());
    const ofNadia = await finder.execute(
      find({
        viewerUserId: NADIA,
        viewerRole: 'guest',
        target: { kind: 'list', listId: SPRINT_14 },
      }),
    );
    const ofLea = await finder.execute(find({ target: { kind: 'list', listId: SPRINT_14 } }));

    expect(ofNadia).toEqual({
      kind: 'list',
      spaceId: PRODUIT,
      spaceName: 'Produit',
      spaceOwnerUserId: CAMILLE,
      listId: SPRINT_14,
      listName: 'Sprint 14',
      viewerRole: 'edit',
      viewerManages: true,
    });
    expect(ofLea).toMatchObject({ viewerRole: null, viewerManages: false });
  });

  it('finds an archived list as a live one, so a request for it is stored and answered', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [
        sprintState({
          organizationAccess: false,
          archivedAt: new Date('2026-11-03T09:00:00Z'),
          archivedBy: { type: 'user', id: CAMILLE },
        }),
      ],
      grants: [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'edit')],
    });

    const target = await new FindAccessTarget(spaces).execute(
      find({
        viewerUserId: NADIA,
        viewerRole: 'guest',
        target: { kind: 'list', listId: SPRINT_14 },
      }),
    );

    expect(target).toMatchObject({ listId: SPRINT_14, viewerRole: 'edit', viewerManages: true });
  });

  it.each([
    ['a space', { kind: 'space', spaceId: UNKNOWN_SPACE }],
    ['a list', { kind: 'list', listId: UNKNOWN_LIST }],
  ] as const)('answers null for %s the organization does not have', async (_kind, target) => {
    expect(await new FindAccessTarget(atelierNord()).execute(find({ target }))).toBeNull();
  });
});

describe('FindAccessTarget: the statements tell nothing of the existence of the target', () => {
  it.each([
    ['a space', { kind: 'space', spaceId: DESIGN }, { kind: 'space', spaceId: UNKNOWN_SPACE }],
    ['a list', { kind: 'list', listId: SPRINT_14 }, { kind: 'list', listId: UNKNOWN_LIST }],
  ] as const)(
    'reads the same for %s that exists and one that does not',
    async (_kind, existing, unknown) => {
      const seen = atelierNord();
      const unseen = atelierNord();

      await new FindAccessTarget(seen).execute(find({ target: existing }));
      await new FindAccessTarget(unseen).execute(find({ target: unknown }));

      expect(unseen.reads).toEqual(seen.reads);
      expect(seen.reads.at(-1)).toBe('grants');
    },
  );

  it('reads the grants even when the rule of the organization gives edit, with the nil UUID for an unknown list', async () => {
    const spaces = atelierNord();

    await new FindAccessTarget(spaces).execute(
      find({
        viewerUserId: CAMILLE,
        viewerRole: 'owner',
        target: { kind: 'list', listId: UNKNOWN_LIST },
      }),
    );

    expect(spaces.reads).toEqual(['list', 'space', 'grants']);
    expect(spaces.viewerGrantsCalls).toEqual([
      {
        viewerUserId: CAMILLE,
        spaceId: '00000000-0000-0000-0000-000000000000',
        listId: '00000000-0000-0000-0000-000000000000',
      },
    ]);
  });
});

describe('FindAccessTarget: lock share holds the row of the target against a deletion', () => {
  it('reads without lock by default', async () => {
    const spaces = atelierNord();

    await new FindAccessTarget(spaces).execute(find());
    await new FindAccessTarget(spaces).execute(
      find({ target: { kind: 'list', listId: SPRINT_14 } }),
    );

    expect(spaces.journal).toEqual([]);
  });

  it('holds the space of a space target, and the list of a list target, for share', async () => {
    const spaces = atelierNord();

    await new FindAccessTarget(spaces).execute(find({ lock: 'share' }));
    await new FindAccessTarget(spaces).execute(
      find({ lock: 'share', target: { kind: 'list', listId: SPRINT_14 } }),
    );

    expect(spaces.journal).toEqual([`space ${DESIGN} share`, `list ${SPRINT_14} share`]);
  });

  it.each([
    ['a space', { kind: 'space', spaceId: DESIGN }, { kind: 'space', spaceId: UNKNOWN_SPACE }],
    ['a list', { kind: 'list', listId: SPRINT_14 }, { kind: 'list', listId: UNKNOWN_LIST }],
  ] as const)(
    'runs the same statements and locks for %s that exists and one that does not',
    async (_kind, existing, unknown) => {
      const seen = atelierNord();
      const unseen = atelierNord();

      await new FindAccessTarget(seen).execute(find({ lock: 'share', target: existing }));
      await new FindAccessTarget(unseen).execute(find({ lock: 'share', target: unknown }));

      expect(unseen.reads).toEqual(seen.reads);
      expect(unseen.journal.map((entry) => entry.replace(/ [0-9a-f-]{36}/u, ''))).toEqual(
        seen.journal.map((entry) => entry.replace(/ [0-9a-f-]{36}/u, '')),
      );
    },
  );

  it('never finds a deleted target, locked or not', async () => {
    const tombstone = {
      deletedAt: new Date('2026-11-08T16:10:00Z'),
      deletedBy: { type: 'user', id: CAMILLE },
    } as const;
    const spaces = new InMemorySpaces({
      spaces: [spaceState(), designState(tombstone)],
      lists: [sprintState(tombstone)],
    });

    expect(await new FindAccessTarget(spaces).execute(find({ lock: 'share' }))).toBeNull();
    expect(
      await new FindAccessTarget(spaces).execute(
        find({ lock: 'share', target: { kind: 'list', listId: SPRINT_14 } }),
      ),
    ).toBeNull();
  });
});
