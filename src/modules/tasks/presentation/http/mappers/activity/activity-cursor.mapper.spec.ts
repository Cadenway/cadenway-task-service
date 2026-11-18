import { ProblemException } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import type { ActivityPosition } from '../../../../application/models/activity/activity-position.model.js';
import {
  toListActivityCursor,
  toListActivityPosition,
  toTaskActivityCursor,
  toTaskActivityPosition,
} from './activity-cursor.mapper.js';

describe('the cursors of the activity of a task and of a list', () => {
  const position: ActivityPosition = {
    occurredAt: new Date('2026-11-18T10:15:30.123Z'),
    id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
  };
  const listId = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02';
  const camille = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';

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

  it('gives the last page no cursor and the first page no position', () => {
    expect(toTaskActivityCursor(null, 'CAD-482', null)).toBeNull();
    expect(toTaskActivityPosition(undefined, 'CAD-482', null)).toBeNull();
    expect(toListActivityCursor(null, listId, null, null)).toBeNull();
    expect(toListActivityPosition(undefined, listId, null, null)).toBeNull();
  });

  it('decodes the cursor of the activity of a task to the position it was built from', () => {
    const cursor: string | null = toTaskActivityCursor(position, 'CAD-482', ['status']);

    expect(toTaskActivityPosition(cursor ?? undefined, 'CAD-482', ['status'])).toEqual(position);
  });

  it('decodes the cursor of a list whatever the case of its id and the order of the filters', () => {
    const cursor: string | null = toListActivityCursor(
      position,
      listId.toUpperCase(),
      ['status', 'assign'],
      [camille, 'task-service'],
    );

    expect(
      toListActivityPosition(
        cursor ?? undefined,
        listId,
        ['assign', 'status', 'assign'],
        ['task-service', camille],
      ),
    ).toEqual(position);
  });

  it('refuses a cursor for other filters, another task or another collection', () => {
    const task: string | null = toTaskActivityCursor(position, 'CAD-482', ['status']);
    const list: string | null = toListActivityCursor(position, listId, null, null);

    expect(
      refusalOf(() => toTaskActivityPosition(task ?? undefined, 'CAD-482', null)).problem.code,
    ).toBe('request.invalid');
    expect(
      refusalOf(() => toTaskActivityPosition(task ?? undefined, 'CAD-483', ['status'])).problem
        .status,
    ).toBe(400);
    expect(
      refusalOf(() => toListActivityPosition(list ?? undefined, listId, ['create'], null)).problem
        .status,
    ).toBe(400);
    expect(
      refusalOf(() => toListActivityPosition(task ?? undefined, listId, null, null)).problem.code,
    ).toBe('request.invalid');
  });
});
