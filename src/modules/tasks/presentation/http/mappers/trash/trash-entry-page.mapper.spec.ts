import {
  EmptyTrashInternalResponse,
  ListTrashInternalResponse,
  RestoreTrashEntryInternalResponse,
  TrashTaskInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import { ProblemException } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import type { TrashPosition } from '../../../../application/models/trash/trash-position.model.js';
import type { TrashEntryPage } from '../../../../application/projections/trash/trash-entry-page.projection.js';
import type { TrashEntryView } from '../../../../application/projections/trash/trash-entry.projection.js';
import type { TrashRestorationView } from '../../../../application/projections/trash/trash-restoration.projection.js';
import { toEmptyTrashInput } from './empty-trash-input.mapper.js';
import { toTrashCursor, toTrashPosition } from './trash-cursor.mapper.js';
import { toTrashEmptied } from './trash-emptied.mapper.js';
import { toTrashEntryPage } from './trash-entry-page.mapper.js';
import { toTrashEntry } from './trash-entry.mapper.js';
import { toTrashRestored } from './trash-restored.mapper.js';

/** Camille Martin (CM), who deleted CAD-452. */
const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';

/** The list Sprint 14. */
const SPRINT_14 = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f12';

/** The space Produit. */
const PRODUIT = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';

/** CAD-452 in the trash, as the use cases return it. */
const CAD_452: TrashEntryView = {
  id: '019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e01',
  task: { key: 'CAD-452', name: 'Ancien écran de connexion', status: 'cancelled' },
  parentKey: null,
  subtaskCount: 0,
  list: { id: SPRINT_14, spaceId: PRODUIT, name: 'Sprint 14', state: 'deleted' },
  trashedAt: new Date('2026-11-06T16:20:00.000Z'),
  trashedBy: { type: 'user', id: CAMILLE },
  purgeAt: new Date('2026-12-06T16:20:00.000Z'),
};

/** The position after CAD-452. */
const POSITION: TrashPosition = { trashedAt: CAD_452.trashedAt, id: CAD_452.id };

/**
 * Runs a decoding and returns the problem it throws.
 *
 * @param decode - The decoding.
 * @returns The problem.
 */
function refusalOf(decode: () => unknown): ProblemException {
  try {
    decode();
  } catch (error) {
    if (error instanceof ProblemException) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected a refusal.');
}

describe('toTrashEntry', () => {
  it('answers an entry the response validator of the contract accepts, instants in ISO 8601', () => {
    const entry = toTrashEntry(CAD_452);

    expect(() => TrashTaskInternalResponse.parse(entry)).not.toThrow();
    expect(entry).toEqual({
      id: CAD_452.id,
      task: { key: 'CAD-452', name: 'Ancien écran de connexion', status: 'cancelled' },
      parentKey: null,
      subtaskCount: 0,
      list: { id: SPRINT_14, spaceId: PRODUIT, name: 'Sprint 14', state: 'deleted' },
      trashedAt: '2026-11-06T16:20:00.000Z',
      trashedBy: { type: 'user', id: CAMILLE },
      purgeAt: '2026-12-06T16:20:00.000Z',
    });
  });
});

describe('toTrashEntryPage and the cursor of the trash', () => {
  const page: TrashEntryPage = { items: [CAD_452], next: POSITION, total: 2 };

  it('answers a page the response validator accepts, with the cursor of the next page and the total', () => {
    const body = toTrashEntryPage(page);

    expect(() => ListTrashInternalResponse.parse(body)).not.toThrow();
    expect(body.total).toBe(2);
    expect(toTrashPosition(body.nextCursor ?? undefined)).toEqual(POSITION);
  });

  it('gives the last page no cursor and the first page no position', () => {
    expect(toTrashCursor(null)).toBeNull();
    expect(toTrashPosition(undefined)).toBeNull();
  });

  it('refuses a forged cursor on the cursor parameter', () => {
    const refusal: ProblemException = refusalOf(() => toTrashPosition('not-a-cursor'));

    expect(refusal.problem).toMatchObject({ status: 400, code: 'request.invalid' });
    expect(refusal.problem.details).toMatchObject({
      issues: [{ in: 'query', path: 'cursor', code: 'invalid_cursor' }],
    });
  });
});

describe('toTrashRestored and toTrashEmptied', () => {
  const restoration: TrashRestorationView = {
    task: {
      id: '019a7200-0000-7000-8000-000000000452',
      key: 'CAD-452',
      name: 'Ancien écran de connexion',
      status: 'cancelled',
      cancelReason: 'duplicate',
      description: 'Remplacé par CAD-482.',
      cancelNote: null,
      priority: 'basse',
      assigneeIds: [CAMILLE],
      dueDate: null,
      startDate: null,
      estimateMinutes: null,
      labels: ['Front'],
      parentKey: null,
      listId: SPRINT_14,
      spaceId: PRODUIT,
      subtaskCounts: { total: 0, closed: 0 },
      checklistCounts: { total: 0, done: 0 },
      completedAt: null,
      createdAt: new Date('2026-10-28T09:00:00.000Z'),
      version: 9,
      checklist: [],
      createdBy: { type: 'user', id: CAMILLE },
      updatedAt: new Date('2026-11-08T15:10:00.000Z'),
      archivedAt: null,
      archivedBy: null,
    },
    list: {
      id: SPRINT_14,
      spaceId: PRODUIT,
      name: 'Sprint 14',
      icon: 'lightning',
      color: 'violet',
      sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: null },
      createdAt: new Date('2026-10-30T16:00:00.000Z'),
      position: new Date('2026-11-08T15:10:00.000Z'),
      version: 3,
      organizationAccess: true,
      archivedAt: null,
      archivedBy: null,
      callerRole: 'edit',
    },
    subtaskCount: 0,
    detached: true,
    listRestored: true,
    spaceRestored: false,
  };

  it('answers a restoration the response validator accepts, the root as Task and its list as TaskList', () => {
    const body = toTrashRestored(restoration);

    expect(() => RestoreTrashEntryInternalResponse.parse(body)).not.toThrow();
    expect(body).toMatchObject({
      task: { key: 'CAD-452', version: 9, updatedAt: '2026-11-08T15:10:00.000Z' },
      list: { id: SPRINT_14, callerRole: 'edit', createdAt: '2026-10-30T16:00:00.000Z' },
      subtaskCount: 0,
      detached: true,
      listRestored: true,
      spaceRestored: false,
    });
    expect(body.list).not.toHaveProperty('position');
  });

  it('answers the count of the entries "Vider la corbeille" took out', () => {
    const body = toTrashEmptied({ entryCount: 12 });

    expect(() => EmptyTrashInternalResponse.parse(body)).not.toThrow();
    expect(body).toEqual({ entryCount: 12 });
  });

  it('builds the input of "Vider la corbeille" from the caller alone', () => {
    expect(toEmptyTrashInput({}, { organizationId: PRODUIT, actorUserId: CAMILLE })).toStrictEqual({
      organizationId: PRODUIT,
      actorUserId: CAMILLE,
    });
  });
});
