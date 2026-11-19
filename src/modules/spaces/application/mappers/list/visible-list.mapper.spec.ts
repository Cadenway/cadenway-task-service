import { describe, expect, it } from 'vitest';

import type { VisibleList } from '../../projections/list/visible-list.projection.js';
import {
  ARCHIVED_AT,
  CAMILLE,
  CREATED_AT,
  PRODUIT,
  SPRINT_14,
  SPRINT_14_GOAL,
  sprintState,
} from '../../use-cases/spaces.fixture.js';
import { toVisibleList } from './visible-list.mapper.js';

/** When Sprint 14 came back from the archives. */
const RESTORED_AT: Date = new Date('2026-11-08T17:00:00Z');

describe('toVisibleList: the public projection of a list', () => {
  it('copies Sprint 14, its archive and the role of the member', () => {
    const list: VisibleList = toVisibleList(
      sprintState({ archivedAt: ARCHIVED_AT, archivedBy: { type: 'user', id: CAMILLE } }),
      'comment',
    );

    expect(list).toEqual({
      id: SPRINT_14,
      spaceId: PRODUIT,
      name: 'Sprint 14',
      icon: null,
      color: 'indigo',
      sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: SPRINT_14_GOAL },
      createdAt: CREATED_AT,
      position: CREATED_AT,
      version: 1,
      organizationAccess: true,
      archivedAt: ARCHIVED_AT,
      archivedBy: { type: 'user', id: CAMILLE },
      callerRole: 'comment',
    } satisfies VisibleList);
  });
});

describe('toVisibleList: the position of a list in its space (positionInSpaceOf)', () => {
  it('places a list that never came back from the archives by its creation', () => {
    expect(toVisibleList(sprintState(), 'edit').position).toEqual(CREATED_AT);
  });

  it('places a restored list by its last restoration, after the lists created before it', () => {
    const list: VisibleList = toVisibleList(sprintState({ restoredAt: RESTORED_AT }), 'edit');

    expect(list.position).toEqual(RESTORED_AT);
    expect(list.createdAt).toEqual(CREATED_AT);
  });

  it('keeps the last restoration of a list archived again, which a later archive keeps', () => {
    const list: VisibleList = toVisibleList(
      sprintState({
        restoredAt: RESTORED_AT,
        archivedAt: new Date('2026-11-12T10:00:00Z'),
        archivedBy: { type: 'user', id: CAMILLE },
      }),
      'edit',
    );

    expect(list.position).toEqual(RESTORED_AT);
  });
});
