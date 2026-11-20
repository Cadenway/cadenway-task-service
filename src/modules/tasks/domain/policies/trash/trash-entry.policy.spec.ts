import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { TrashHandOverInvalidError } from '../../errors/trash/trash-hand-over-invalid.error.js';
import { CAD_482_ENTRY, CAMILLE, NOW } from '../../tasks.fixture.js';
import { erasureActorOf, handOverOf, isRestorable, subtaskCountOf } from './trash-entry.policy.js';

describe('handOverOf: the hand-over of an entry by "Vider la corbeille"', () => {
  it('reads no hand-over for an entry in the trash, and the instant and actor of one handed over', () => {
    expect(handOverOf(CAD_482_ENTRY, null, null, null)).toBeNull();
    expect(handOverOf(CAD_482_ENTRY, NOW, 'user', CAMILLE)).toEqual({
      at: NOW,
      by: { type: 'user', id: CAMILLE },
    });
  });

  it.each<[string, Date | null, 'user' | null, string | null]>([
    ['an instant alone', NOW, null, null],
    ['an actor without instant', null, 'user', CAMILLE],
    ['an empty actor', NOW, 'user', ''],
    ['an invalid instant', new Date(Number.NaN), 'user', CAMILLE],
  ])('refuses %s with a typed error naming the entry', (_case, at, byType, byId) => {
    expect(() => handOverOf(CAD_482_ENTRY, at, byType, byId)).toThrow(TrashHandOverInvalidError);
    expect(() => handOverOf(CAD_482_ENTRY, at, byType, byId)).toThrow(CAD_482_ENTRY);
  });
});

describe('isRestorable and erasureActorOf: an entry handed over left the trash', () => {
  const handedOver = { at: NOW, by: { type: 'user', id: CAMILLE } } as const;

  it('lets a person restore or erase an entry only while it is in the trash', () => {
    expect(isRestorable(null)).toBe(true);
    expect(isRestorable(handedOver)).toBe(false);
  });

  it('erases an entry handed over by its requester, and an entry due by task-service', () => {
    expect(erasureActorOf(handedOver)).toEqual({ type: 'user', id: CAMILLE });
    expect(erasureActorOf(null)).toEqual({ type: 'system', id: 'task-service' });
  });
});

describe('subtaskCountOf: the subtasks of an entry, its root left out', () => {
  it('counts the tasks of the entry less its root', () => {
    expect(subtaskCountOf(1)).toBe(0);
    expect(subtaskCountOf(3)).toBe(2);
  });

  it.each([0, -1, 1.5])('refuses a count of %s', (count: number) => {
    expect(() => subtaskCountOf(count)).toThrow(InvalidTaskError);
  });
});
