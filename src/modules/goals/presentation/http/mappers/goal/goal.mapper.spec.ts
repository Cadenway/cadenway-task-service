import { describe, expect, it } from 'vitest';

import {
  decodeGoalCursor,
  encodeGoalCursor,
  goalCursorScope,
  goalResponse,
} from './goal.mapper.js';
import type { GoalView } from '../../../../application/models/goal/goal-view.model.js';

describe('goal response and cursor mapping', () => {
  const caller = {
    organizationId: '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01',
    userId: '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e02',
  };

  it('binds the page boundary to the actor, quarter and date', () => {
    const scope = goalCursorScope(caller, '2026-Q4', '2026-11-20');
    const position = {
      id: '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e03',
      createdAt: new Date('2026-11-20T12:00:00.000Z'),
    };
    const cursor = encodeGoalCursor(position, scope);
    expect(cursor).not.toBeNull();
    expect(decodeGoalCursor(cursor ?? undefined, scope)).toEqual(position);
    expect(() =>
      decodeGoalCursor(cursor ?? undefined, goalCursorScope(caller, '2026-Q4', '2026-11-21')),
    ).toThrow();
  });

  it('maps the visible projection without leaking additional fields', () => {
    const goal: GoalView & { readonly secret: string } = {
      id: '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e03',
      name: 'Goal',
      ownerUserId: caller.userId,
      dueDate: '2026-12-31',
      spaceId: null,
      quarter: '2026-Q4',
      version: 1,
      progressPercent: 0,
      health: 'behind',
      results: [],
      secret: 'hidden',
    };
    expect(goalResponse(goal)).not.toHaveProperty('secret');
    expect(goalResponse(goal).results).toEqual([]);
  });
});
