import type { TaskList } from '@cadenway/contracts/types/internal/task-service';
import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  CAMILLE,
  SPRINT_14,
  sprintState,
} from '../../../../application/use-cases/spaces.fixture.js';
import { toTaskList } from './task-list.mapper.js';

describe('toTaskList: every TaskList carries its archive, null when live', () => {
  it('answers archivedAt and archivedBy as null for a live list', () => {
    const body: TaskList = toTaskList({ list: sprintState(), callerRole: 'edit' });

    expect(body).toMatchObject({ id: SPRINT_14, archivedAt: null, archivedBy: null });
    expect(Object.keys(body)).toEqual(expect.arrayContaining(['archivedAt', 'archivedBy']));
  });

  it('answers when and by whom an archived list was archived, in ISO 8601', () => {
    const body: TaskList = toTaskList({
      list: sprintState({ archivedAt: ARCHIVED_AT, archivedBy: { type: 'user', id: CAMILLE } }),
      callerRole: 'comment',
    });

    expect(body).toMatchObject({
      archivedAt: '2026-11-03T09:00:00.000Z',
      archivedBy: { type: 'user', id: CAMILLE },
      callerRole: 'comment',
    });
  });

  it('keeps when a list was restored inside the service', () => {
    const body: TaskList = toTaskList({
      list: sprintState({ restoredAt: new Date('2026-11-08T17:00:00Z') }),
      callerRole: 'edit',
    });

    expect(Object.keys(body)).not.toContain('restoredAt');
    expect(body.archivedAt).toBeNull();
  });
});
