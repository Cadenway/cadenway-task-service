import { describe, expect, it } from 'vitest';

import { Goal } from '../../../../../domain/aggregates/goal/goal.aggregate.js';
import type { GoalRecord } from '../../../../models/goal/goal-record.model.js';
import type { GoalsStore } from '../../../../models/goal/goals-store.model.js';
import { ListGoals } from './list-goals.use-case.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const userId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e02';
const privateSpace = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e03';

/** Creates descending records with a run of inaccessible spaces before visible goals. */
function records(): GoalRecord[] {
  return Array.from({ length: 105 }, (_, index) => {
    const id = `019a7000-1a2b-7c3d-8e4f-${String(index + 1).padStart(12, '0')}`;
    const goal = Goal.create({
      organizationId,
      id,
      ownerUserId: userId,
      name: 'Goal',
      quarter: '2026-Q4',
      dueDate: '2026-12-31',
      spaceId: index < 102 ? privateSpace : null,
      results: [
        {
          id: '019a7000-1a2b-7c3d-8e4f-000000000999',
          label: 'Done',
          kind: 'checkbox',
          checked: index === 102,
        },
      ],
    });
    return {
      goal,
      position: { createdAt: new Date(Date.UTC(2026, 10, 30, 0, 0, 0, 0) - index), id },
    };
  });
}

/** Supplies a keyset repository and deliberately hides the private space. */
function createStore(): GoalsStore {
  const rows = records();
  return {
    goals: {
      async nextId() {
        await Promise.resolve();
        throw new Error('Unexpected write');
      },
      async find() {
        await Promise.resolve();
        throw new Error('Unexpected lookup');
      },
      async create() {
        await Promise.resolve();
        throw new Error('Unexpected write');
      },
      async save() {
        await Promise.resolve();
        throw new Error('Unexpected write');
      },
      async delete() {
        await Promise.resolve();
        throw new Error('Unexpected write');
      },
      async listCandidates(tenant, quarter, after, limit) {
        await Promise.resolve();
        expect(tenant).toBe(organizationId);
        expect(quarter).toBe('2026-Q4');
        const start =
          after === null ? 0 : rows.findIndex((row) => row.position.id === after.id) + 1;
        return rows.slice(start, start + limit);
      },
    },
    async findViewer() {
      await Promise.resolve();
      return { organizationId, userId, role: 'member' };
    },
    async findScope() {
      await Promise.resolve();
      return null;
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
}

describe('ListGoals', () => {
  it('continues through hidden candidate batches, reports full visible summary and resumes after the last visible goal', async () => {
    const store = createStore();
    const work = {
      run: async <T>(action: (value: GoalsStore) => Promise<T>) => action(store),
      read: async <T>(action: (value: GoalsStore) => Promise<T>) => action(store),
    };
    const list = new ListGoals(work);
    const input = {
      organizationId,
      userId,
      quarter: '2026-Q4',
      today: '2026-12-31',
      after: null,
      limit: 2,
    };
    const first = await list.execute(input);
    expect(first.items).toHaveLength(2);
    expect(first.summary).toMatchObject({
      goalCount: 3,
      achievedCount: 1,
      averageProgressPercent: 100 / 3,
    });
    expect(first.nextPosition?.id).toBe(first.items[1]?.id);
    const second = await list.execute({ ...input, after: first.nextPosition });
    expect(second.items).toHaveLength(1);
    expect(second.nextPosition).toBeNull();
    expect(second.summary).toEqual(first.summary);
    expect(second.items[0]?.id).not.toBe(first.items[1]?.id);
  });

  it('omits organization goals from guest results and summary', async () => {
    const store = createStore();
    const guestStore: GoalsStore = {
      ...store,
      findViewer: () => Promise.resolve({ organizationId, userId, role: 'guest' }),
    };
    const work = {
      run: <T>(action: (value: GoalsStore) => Promise<T>) => action(guestStore),
      read: <T>(action: (value: GoalsStore) => Promise<T>) => action(guestStore),
    };
    const result = await new ListGoals(work).execute({
      organizationId,
      userId,
      quarter: '2026-Q4',
      today: '2026-12-31',
      after: null,
      limit: 10,
    });
    expect(result.items).toEqual([]);
    expect(result.summary.goalCount).toBe(0);
  });
});
