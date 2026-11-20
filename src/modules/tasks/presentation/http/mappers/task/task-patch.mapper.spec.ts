import { describe, expect, it } from 'vitest';

import { UpdateTaskBody } from '../../dto/input/task/update-task-body.dto.js';
import { editsDescription, toTaskChange } from './task-patch.mapper.js';

/**
 * Parses a patch with the schema of the contract, as the validation pipe does.
 *
 * @param patch - The body as sent.
 * @returns The parsed body.
 */
function parse(patch: unknown): UpdateTaskBody {
  return UpdateTaskBody.schema.parse(patch);
}

describe('toTaskChange', () => {
  it('retains disabling a milestone and a recurrence together', () => {
    expect(toTaskChange(parse({ milestone: false, recurrence: 'none' }))).toStrictEqual({
      milestone: false,
      recurrence: 'none',
    });
  });

  it('keeps a member left out absent', () => {
    expect(toTaskChange(parse({}))).toStrictEqual({});
    expect(toTaskChange(parse({ priority: 'haute' }))).toStrictEqual({ priority: 'haute' });
  });

  it('keeps a member sent as null, which clears it, distinct from a member left out', () => {
    expect(
      toTaskChange(
        parse({
          description: null,
          cancelReason: null,
          cancelNote: null,
          dueDate: null,
          startDate: null,
          estimateMinutes: null,
          parentKey: null,
        }),
      ),
    ).toStrictEqual({
      description: null,
      cancelReason: null,
      cancelNote: null,
      dueDate: null,
      startDate: null,
      estimateMinutes: null,
      parentKey: null,
    });
  });

  it('maps every member the contract declares and lower-cases the list', () => {
    expect(
      toTaskChange(
        parse({
          name: 'Relire',
          status: 'cancelled',
          cancelReason: 'duplicate',
          cancelNote: 'CAD-12',
          priority: 'basse',
          dueDate: '2026-11-20',
          startDate: '2026-11-18',
          estimateMinutes: 60,
          listId: '019A7003-4D5E-7F6A-8B9C-0D1E2F3A4B02',
          parentKey: 'CAD-481',
        }),
      ),
    ).toStrictEqual({
      name: 'Relire',
      status: 'cancelled',
      cancelReason: 'duplicate',
      cancelNote: 'CAD-12',
      priority: 'basse',
      dueDate: '2026-11-20',
      startDate: '2026-11-18',
      estimateMinutes: 60,
      listId: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02',
      parentKey: 'CAD-481',
    });
  });

  it('ignores the collections, which change through their own routes', () => {
    expect(
      toTaskChange(parse({ assigneeIds: ['019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31'], labels: ['a'] })),
    ).toStrictEqual({});
  });
});

describe('editsDescription', () => {
  it('is true whenever the patch names the description, even as null', () => {
    expect(editsDescription(parse({ description: 'Nouveau texte' }))).toBe(true);
    expect(editsDescription(parse({ description: null }))).toBe(true);
    expect(editsDescription(parse({ description: '' }))).toBe(true);
  });

  it('is false for a patch without the description', () => {
    expect(editsDescription(parse({}))).toBe(false);
    expect(editsDescription(parse({ name: 'Relire' }))).toBe(false);
  });
});
