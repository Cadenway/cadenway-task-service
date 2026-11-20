import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAD_482,
  CAD_482_ENTRY,
  CAMILLE,
  NOW,
  SPRINT_14,
  TRASHED_AT,
} from '../../../../../domain/tasks.fixture.js';
import { TrashHandOverInvalidError } from '../../../../../domain/errors/trash/trash-hand-over-invalid.error.js';
import type { RawTrashEntryRow } from './raw-trash-entry-row.mapper.js';
import { toTrashEntryRecord } from './trash-entry.mapper.js';

/**
 * Builds the row of the entry of CAD-482 as the driver returns it.
 *
 * @param overrides - Columns to replace.
 * @returns The row.
 */
function rowOf(overrides: Partial<RawTrashEntryRow> = {}): RawTrashEntryRow {
  return {
    id: CAD_482_ENTRY,
    organizationId: ATELIER_NORD,
    rootTaskId: CAD_482,
    listId: SPRINT_14,
    parentKey: null,
    taskCount: 3,
    trashedAt: TRASHED_AT.toISOString(),
    trashedByType: 'user',
    trashedById: CAMILLE,
    purgeRequestedAt: null,
    purgeRequestedByType: null,
    purgeRequestedById: null,
    rootErased: false,
    rootKeyPrefix: 'CAD',
    rootKeyNumber: 482,
    rootName: 'Refondre l’écran de connexion SSO',
    rootStatus: 'progress',
    ...overrides,
  };
}

describe('toTrashEntryRecord: a row of the trash becomes the entry it stores', () => {
  it('reads an entry still in the trash with its root', () => {
    expect(toTrashEntryRecord(rowOf())).toEqual({
      id: CAD_482_ENTRY,
      organizationId: ATELIER_NORD,
      rootTaskId: CAD_482,
      listId: SPRINT_14,
      parentKey: null,
      taskCount: 3,
      rootErased: false,
      trashedAt: TRASHED_AT,
      trashedBy: { type: 'user', id: CAMILLE },
      root: { key: 'CAD-482', name: 'Refondre l’écran de connexion SSO', status: 'progress' },
      purgeRequest: null,
    });
  });

  it('reads the hand-over of "Vider la corbeille"', () => {
    expect(
      toTrashEntryRecord(
        rowOf({
          purgeRequestedAt: NOW.toISOString(),
          purgeRequestedByType: 'user',
          purgeRequestedById: CAMILLE,
        }),
      ).purgeRequest,
    ).toEqual({ at: NOW, by: { type: 'user', id: CAMILLE } });
  });

  it('refuses a hand-over set in part only, an actor type or a status outside their sets', () => {
    expect(() => toTrashEntryRecord(rowOf({ purgeRequestedAt: NOW.toISOString() }))).toThrow(
      TrashHandOverInvalidError,
    );
    expect(() => toTrashEntryRecord(rowOf({ trashedByType: 'robot' }))).toThrow(
      'A stored actor type is outside the actor types',
    );
    expect(() => toTrashEntryRecord(rowOf({ rootStatus: 'archived' }))).toThrow();
  });
});
