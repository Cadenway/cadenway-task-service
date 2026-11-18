import { encodeCursor, ProblemException } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import type { PagePosition } from '../../../../application/models/page/page-position.model.js';
import { toSubtasksCursor, toSubtasksPosition } from '../subtask/subtask-cursor.mapper.js';

describe('the cursor of the subtasks of a task', () => {
  const position: PagePosition = {
    createdAt: new Date('2026-11-18T10:15:30.123Z'),
    id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
  };

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
    expect(toSubtasksCursor(null, 'CAD-482')).toBeNull();
    expect(toSubtasksPosition(undefined, 'CAD-482')).toBeNull();
  });

  it('decodes the cursor to the position it was built from', () => {
    const cursor: string | null = toSubtasksCursor(position, 'CAD-482');

    expect(cursor).not.toBeNull();
    expect(toSubtasksPosition(cursor ?? undefined, 'CAD-482')).toEqual(position);
  });

  it('lower-cases the id of a forged cursor in upper case, as the rows hold it', () => {
    const filters = { collection: 'subtasks', taskKey: 'CAD-482' };
    const upper: string = encodeCursor(
      { sort: [position.createdAt.toISOString()], id: position.id.toUpperCase() },
      filters,
    );

    expect(toSubtasksPosition(upper, 'CAD-482')).toEqual(position);
  });

  it('refuses the cursor of another task, on the cursor parameter', () => {
    const cursor: string | null = toSubtasksCursor(position, 'CAD-482');
    const refusal: ProblemException = refusalOf(() =>
      toSubtasksPosition(cursor ?? undefined, 'CAD-483'),
    );

    expect(refusal.problem.status).toBe(400);
    expect(refusal.problem.code).toBe('request.invalid');
  });

  it('refuses a cursor that is not an instant and a UUID, without quoting it', () => {
    const filters = { collection: 'subtasks', taskKey: 'CAD-482' };
    const forged: readonly string[] = [
      encodeCursor({ sort: ['not a date'], id: position.id }, filters),
      encodeCursor({ sort: ['2026-11-18'], id: position.id }, filters),
      encodeCursor({ sort: ['12026-11-18T10:15:30.123Z'], id: position.id }, filters),
      encodeCursor({ sort: [42], id: position.id }, filters),
      encodeCursor({ sort: [], id: position.id }, filters),
      encodeCursor({ sort: [position.createdAt.toISOString(), 'x'], id: position.id }, filters),
      encodeCursor({ sort: [position.createdAt.toISOString()], id: "1' OR '1'='1" }, filters),
    ];

    for (const cursor of forged) {
      const refusal: ProblemException = refusalOf(() => toSubtasksPosition(cursor, 'CAD-482'));

      expect(refusal.problem.status).toBe(400);
      expect(refusal.problem.code).toBe('request.invalid');
      expect(JSON.stringify(refusal.problem)).not.toContain('OR');
    }
  });

  it('refuses a malformed cursor', () => {
    expect(refusalOf(() => toSubtasksPosition('%%%', 'CAD-482')).problem.code).toBe(
      'request.invalid',
    );
  });
});
