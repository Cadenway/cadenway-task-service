import { describe, expect, it } from 'vitest';

import { toTrashListAccess } from './trash-list-access.mapper.js';
import type { TrashListAccessRow } from './trash-list-access.mapper.js';

/**
 * Builds a lean row of the trash: Sprint 14 of Produit, both deleted.
 *
 * @param overrides - Fields to replace.
 * @returns The row.
 */
function sprint14Row(overrides: Partial<TrashListAccessRow> = {}): TrashListAccessRow {
  return {
    listId: '019a7100-0000-7000-8000-000000000002',
    spaceId: '019a7000-0000-7000-8000-000000000001',
    name: 'Sprint 14',
    organizationAccess: true,
    archivedAt: null,
    deletedAt: new Date('2026-11-08T16:10:00Z'),
    visibility: 'organization',
    ownerUserId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30',
    awaitingOwner: false,
    spaceDeletedAt: new Date('2026-11-08T16:10:00Z'),
    spaceGrantRole: null,
    listGrantRole: 'edit',
    ...overrides,
  };
}

describe('toTrashListAccess: a lean row of the trash reads', () => {
  it('maps the list, its tombstones, its space as the policies read it and the grants', () => {
    expect(toTrashListAccess(sprint14Row())).toEqual({
      listId: '019a7100-0000-7000-8000-000000000002',
      spaceId: '019a7000-0000-7000-8000-000000000001',
      name: 'Sprint 14',
      organizationAccess: true,
      archivedAt: null,
      deletedAt: new Date('2026-11-08T16:10:00Z'),
      space: {
        visibility: 'organization',
        ownerUserId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30',
        awaitingOwner: false,
        deletedAt: new Date('2026-11-08T16:10:00Z'),
      },
      grants: { space: null, list: 'edit' },
    });
  });

  it('refuses a stored visibility or role outside their sets', () => {
    expect(() => toTrashListAccess(sprint14Row({ visibility: 'public' }))).toThrow(
      'A stored visibility is neither organization nor private.',
    );
    expect(() => toTrashListAccess(sprint14Row({ spaceGrantRole: 'owner' }))).toThrow(
      'A stored role is not edit, comment or view.',
    );
  });
});
