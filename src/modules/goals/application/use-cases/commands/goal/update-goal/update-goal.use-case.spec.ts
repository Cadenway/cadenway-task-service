import { describe, expect, it, vi } from 'vitest';

import { Goal } from '../../../../../domain/aggregates/goal/goal.aggregate.js';
import type { GoalsStore } from '../../../../models/goal/goals-store.model.js';
import type { GoalError } from '../../../../models/goal/goal-error.model.js';
import { UpdateGoal } from './update-goal.use-case.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const userId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e02';
const goalId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e03';

/** Builds an organization goal with configurable current membership. */
function fixture(role: 'owner' | 'member') {
  const goal = Goal.create({
    organizationId,
    id: goalId,
    ownerUserId: userId,
    name: 'Goal',
    quarter: '2026-Q4',
    dueDate: '2026-12-31',
  });
  const save = vi.fn(async () => Promise.resolve());
  const store: GoalsStore = {
    goals: {
      async nextId() {
        await Promise.resolve();
        throw new Error('Unexpected allocation');
      },
      async find() {
        await Promise.resolve();
        return { goal, position: { createdAt: new Date(), id: goalId } };
      },
      async listCandidates() {
        await Promise.resolve();
        return [];
      },
      async create() {
        await Promise.resolve();
        throw new Error('Unexpected creation');
      },
      save,
      async delete() {
        await Promise.resolve();
        throw new Error('Unexpected deletion');
      },
    },
    async findViewer() {
      await Promise.resolve();
      return { organizationId, userId, role };
    },
    async findScope() {
      await Promise.resolve();
      return 'edit';
    },
    async visibleSpaces() {
      await Promise.resolve();
      return new Set<string>();
    },
    async ownerCanReadScope() {
      await Promise.resolve();
      return true;
    },
    async measureLinks() {
      await Promise.resolve();
      return { lists: new Map(), milestones: new Map() };
    },
  };
  const work = {
    run: async <T>(action: (value: GoalsStore) => Promise<T>) => action(store),
    read: async <T>(action: (value: GoalsStore) => Promise<T>) => action(store),
  };
  return { operation: new UpdateGoal(work), save };
}

describe('UpdateGoal', () => {
  const input = {
    organizationId,
    userId,
    goalId,
    today: '2026-12-01',
    expectedVersions: [1],
    patch: { name: ' Goal ' },
  };

  it('preserves the version and avoids a write for a normalized no-op', async () => {
    const { operation, save } = fixture('owner');
    const result = await operation.execute(input);
    expect(result.version).toBe(1);
    expect(save).not.toHaveBeenCalled();
  });

  it('does not reveal the current version to an unauthorized writer', async () => {
    const { operation, save } = fixture('member');
    await expect(operation.execute({ ...input, expectedVersions: [2] })).rejects.toMatchObject<
      Partial<GoalError>
    >({
      failure: { reason: 'organization-role-forbidden' },
    });
    expect(save).not.toHaveBeenCalled();
  });
});
