import { describe, expect, it, vi } from 'vitest';

import { Goal } from '../../../../../domain/aggregates/goal/goal.aggregate.js';
import type { GoalLinkMeasurements } from '../../../../../domain/value-objects/goal/goal-link-measurements.value-object.js';
import type { GoalResult } from '../../../../../domain/value-objects/goal/goal-result.value-object.js';
import type { GoalCaller } from '../../../../models/goal/goal-caller.model.js';
import type { GoalsStore } from '../../../../models/goal/goals-store.model.js';
import type { GoalViewer } from '../../../../models/goal/goal-viewer.model.js';
import type { NewGoalResult } from '../../../../models/goal/new-goal-result.model.js';
import { CreateGoal } from '../create-goal/create-goal.use-case.js';
import { CreateGoalResult } from './create-goal-result.use-case.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const userId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e02';
const goalId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e03';
const spaceId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e04';
const listId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e05';
const caller = { organizationId, userId };
const result = { kind: 'list-progress', label: 'Progress', listId } as const;
const createGoalInput = {
  ...caller,
  name: 'Launch',
  ownerUserId: userId,
  dueDate: '2026-12-31',
  quarter: '2026-Q4',
  today: '2026-11-20',
  spaceId,
  results: [result],
};
const createResultInput = { ...caller, goalId, expectedVersions: [999], result };

/** Provides spies for access and any unintended write or lock. */
function fixture() {
  const goal = Goal.create({
    organizationId,
    id: goalId,
    name: 'Launch',
    ownerUserId: userId,
    dueDate: '2026-12-31',
    quarter: '2026-Q4',
    spaceId,
  });
  const findViewer = vi
    .fn<(actor: GoalCaller, lock: boolean) => Promise<GoalViewer | null>>()
    .mockResolvedValue({ ...caller, role: 'member' });
  const findScope = vi
    .fn<
      (
        viewer: GoalViewer,
        space: string,
        lock: boolean,
      ) => Promise<'edit' | 'comment' | 'view' | null>
    >()
    .mockResolvedValue('edit');
  const find = vi.fn<GoalsStore['goals']['find']>().mockResolvedValue({
    goal,
    position: { createdAt: new Date('2026-11-20T00:00:00Z'), id: goalId },
  });
  const links: GoalLinkMeasurements = {
    lists: new Map([[listId, { eligibleTaskCount: 2, doneTaskCount: 1 }]]),
    milestones: new Map(),
  };
  const measureLinks = vi
    .fn<
      (
        viewer: GoalViewer,
        values: readonly (GoalResult | NewGoalResult)[],
        lock: boolean,
      ) => Promise<GoalLinkMeasurements>
    >()
    .mockResolvedValue(links);
  const nextId = vi.fn().mockRejectedValue(new Error('Unexpected allocation'));
  const save = vi.fn().mockRejectedValue(new Error('Unexpected write'));
  const store: GoalsStore = {
    goals: {
      nextId,
      find,
      listCandidates: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockRejectedValue(new Error('Unexpected write')),
      save,
      delete: vi.fn().mockRejectedValue(new Error('Unexpected write')),
    },
    findViewer,
    findScope,
    measureLinks,
    visibleSpaces: vi.fn().mockResolvedValue(new Set()),
    ownerCanReadScope: vi.fn().mockRejectedValue(new Error('Unexpected owner lookup')),
  };
  const run = vi.fn().mockRejectedValue(new Error('Unexpected write transaction'));
  const work = { run, read: <T>(action: (value: GoalsStore) => Promise<T>) => action(store) };
  return {
    createGoal: new CreateGoal(work),
    createResult: new CreateGoalResult(work),
    findViewer,
    findScope,
    find,
    measureLinks,
    run,
    nextId,
    save,
  };
}

describe('goal creation replay authorization', () => {
  it('rejects a removed member before resolving goal data', async () => {
    const f = fixture();
    f.findViewer.mockResolvedValue(null);
    await expect(f.createResult.assertCanReplay(createResultInput)).rejects.toMatchObject({
      failure: { reason: 'missing-organization' },
    });
    expect(f.find).not.toHaveBeenCalled();
    expect(f.run).not.toHaveBeenCalled();
  });

  it('checks current edit rights without revealing a stale version', async () => {
    const f = fixture();
    f.findScope.mockResolvedValue('view');
    await expect(f.createResult.assertCanReplay(createResultInput)).rejects.toMatchObject({
      failure: { reason: 'role-insufficient', role: 'view' },
    });
    expect(f.measureLinks).not.toHaveBeenCalled();
    expect(f.find).toHaveBeenCalledWith(organizationId, goalId, false);
    expect(f.findScope).toHaveBeenCalledWith(expect.anything(), spaceId, false);
  });

  it('rejects a target that became unreadable before replaying either response', async () => {
    const f = fixture();
    f.measureLinks.mockResolvedValue({ lists: new Map(), milestones: new Map() });
    await expect(f.createResult.assertCanReplay(createResultInput)).rejects.toMatchObject({
      failure: { reason: 'result-target-invalid' },
    });
    await expect(f.createGoal.assertCanReplay(createGoalInput)).rejects.toMatchObject({
      failure: { reason: 'result-target-invalid' },
    });
    expect(f.measureLinks).toHaveBeenCalledWith(expect.anything(), [result], false, undefined);
    expect(f.run).not.toHaveBeenCalled();
  });

  it('permits stale conditions on a genuine replay using only a read snapshot', async () => {
    const f = fixture();
    await expect(f.createResult.assertCanReplay(createResultInput)).resolves.toBeUndefined();
    await expect(f.createGoal.assertCanReplay(createGoalInput)).resolves.toBeUndefined();
    expect(f.findViewer).toHaveBeenCalledWith(expect.objectContaining(caller), false);
    expect(f.findScope).toHaveBeenCalledWith(expect.anything(), spaceId, false);
    expect(f.find).toHaveBeenCalledWith(organizationId, goalId, false);
    expect(f.measureLinks).toHaveBeenCalledWith(expect.anything(), [result], false, undefined);
    expect(f.run).not.toHaveBeenCalled();
    expect(f.nextId).not.toHaveBeenCalled();
    expect(f.save).not.toHaveBeenCalled();
  });

  it('normalizes uppercase linked list IDs for both replay checks', async () => {
    const f = fixture();
    const upper = { ...result, listId: listId.toUpperCase() };
    await expect(
      f.createGoal.assertCanReplay({ ...createGoalInput, results: [upper] }),
    ).resolves.toBeUndefined();
    await expect(
      f.createResult.assertCanReplay({ ...createResultInput, result: upper }),
    ).resolves.toBeUndefined();
    expect(f.measureLinks).toHaveBeenCalledWith(expect.anything(), [result], false, undefined);
  });
});
