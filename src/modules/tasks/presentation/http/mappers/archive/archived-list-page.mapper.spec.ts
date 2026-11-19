import { ListArchivedListsInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import type { ArchivedListPage } from '../../../../application/projections/archive/archived-list-page.projection.js';
import { toArchivesPosition } from './archive-cursor.mapper.js';
import { toArchivedListPage } from './archived-list-page.mapper.js';

/** Camille Martin (CM), who archived Sprint 13. */
const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';

/** One page holding Sprint 13, archived on 2026-11-03 with 14 tasks, the last page. */
const PAGE: ArchivedListPage = {
  items: [
    {
      list: {
        id: '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f10',
        spaceId: '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01',
        name: 'Sprint 13',
        icon: 'lightning',
        color: 'violet',
        sprint: {
          startDate: '2026-10-20',
          endDate: '2026-11-02',
          goal: 'Livrer les invitations par lien.',
        },
        createdAt: new Date('2026-10-16T10:00:00.000Z'),
        position: new Date('2026-10-16T10:00:00.000Z'),
        version: 4,
        organizationAccess: true,
        archivedAt: new Date('2026-11-03T09:00:00.000Z'),
        archivedBy: { type: 'user', id: CAMILLE },
        callerRole: 'edit',
      },
      taskCount: 14,
    },
  ],
  next: null,
  total: 1,
};

describe('toArchivedListPage', () => {
  it('answers the page of the contract example, which its validator accepts', () => {
    const body = toArchivedListPage(PAGE);

    expect(() => ListArchivedListsInternalResponse.parse(body)).not.toThrow();
    expect(body).toEqual({
      items: [
        {
          list: {
            id: '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f10',
            spaceId: '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01',
            name: 'Sprint 13',
            icon: 'lightning',
            color: 'violet',
            sprint: {
              startDate: '2026-10-20',
              endDate: '2026-11-02',
              goal: 'Livrer les invitations par lien.',
            },
            createdAt: '2026-10-16T10:00:00.000Z',
            version: 4,
            organizationAccess: true,
            archivedAt: '2026-11-03T09:00:00.000Z',
            archivedBy: { type: 'user', id: CAMILLE },
            callerRole: 'edit',
          },
          taskCount: 14,
        },
      ],
      nextCursor: null,
      total: 1,
    });
  });

  it('gives the cursor of the next page of the tab', () => {
    const next = {
      archivedAt: new Date('2026-11-03T09:00:00.000Z'),
      id: PAGE.items[0]?.list.id ?? '',
    };

    const body = toArchivedListPage({ ...PAGE, next });

    expect(toArchivesPosition(body.nextCursor ?? undefined, 'archived-lists')).toEqual(next);
  });
});
