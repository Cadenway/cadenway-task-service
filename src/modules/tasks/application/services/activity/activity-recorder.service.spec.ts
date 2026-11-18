import { describe, expect, it } from 'vitest';

import type { ActivityEntryDraft } from '../../../domain/value-objects/activity/activity-entry-draft.value-object.js';
import {
  ATELIER_NORD,
  CAD_482,
  CAMILLE,
  CAMILLE_ACTOR,
  INES_ACTOR,
  InMemoryTasks,
  NOW,
  SPRINT_14,
  priorityEntry,
} from '../../use-cases/tasks.fixture.js';
import { ActivityRecorder } from './activity-recorder.service.js';

/**
 * Builds a draft of CAD-482 in Sprint 14.
 *
 * @param change - What changed.
 * @param overrides - Fields to replace.
 * @returns The draft.
 */
function draft(
  change: ActivityEntryDraft['change'],
  overrides: Partial<ActivityEntryDraft> = {},
): ActivityEntryDraft {
  return {
    organizationId: ATELIER_NORD,
    taskId: CAD_482,
    listId: SPRINT_14,
    actor: CAMILLE_ACTOR,
    occurredAt: NOW,
    change,
    ...overrides,
  };
}

/**
 * Records drafts in one unit of work of a store that holds the given entries.
 *
 * @param tasks - The fake store.
 * @param drafts - The drafts.
 * @returns Resolves once recorded.
 */
async function record(tasks: InMemoryTasks, drafts: readonly ActivityEntryDraft[]): Promise<void> {
  await tasks.run((store) => new ActivityRecorder().record(store.activity, drafts));
}

describe('ActivityRecorder: the entries of a change are inserted, merged or deleted', () => {
  it('inserts the entries of the kinds that never merge, one per change', async () => {
    const tasks = new InMemoryTasks();

    await record(tasks, [
      draft({ kind: 'status', status: { from: 'todo', to: 'progress' } }),
      draft({ kind: 'status', status: { from: 'progress', to: 'review' } }),
      draft({ kind: 'assign', assignee: { userId: CAMILLE, added: true } }),
    ]);

    expect([...tasks.activity.values()].map((entry) => entry.change.kind)).toEqual([
      'status',
      'status',
      'assign',
    ]);
  });

  it('merges a priority change into the entry of the same actor within 60 seconds', async () => {
    const tasks = new InMemoryTasks({ activity: [priorityEntry()] });

    await record(tasks, [
      draft({ kind: 'priority', priority: { from: 'haute', to: 'urgente' } }, { occurredAt: NOW }),
    ]);

    expect([...tasks.activity.values()]).toEqual([
      expect.objectContaining({
        id: priorityEntry().id,
        occurredAt: NOW,
        change: { kind: 'priority', priority: { from: 'moyenne', to: 'urgente' } },
      }),
    ]);
  });

  it('deletes the entry when the merged change is back to where it started', async () => {
    const tasks = new InMemoryTasks({ activity: [priorityEntry()] });

    await record(tasks, [draft({ kind: 'priority', priority: { from: 'haute', to: 'moyenne' } })]);

    expect(tasks.activity.size).toBe(0);
  });

  it('inserts a new entry when the actor differs', async () => {
    const tasks = new InMemoryTasks({ activity: [priorityEntry()] });

    await record(tasks, [
      draft({ kind: 'priority', priority: { from: 'haute', to: 'basse' } }, { actor: INES_ACTOR }),
    ]);

    expect(tasks.activity.size).toBe(2);
  });

  it('inserts a new entry when the latest of the kind is older than 60 seconds', async () => {
    const tasks = new InMemoryTasks({
      activity: [priorityEntry({ occurredAt: new Date(NOW.getTime() - 60_001) })],
    });

    await record(tasks, [draft({ kind: 'priority', priority: { from: 'haute', to: 'basse' } })]);

    expect(tasks.activity.size).toBe(2);
  });

  it('writes nothing for no draft', async () => {
    const tasks = new InMemoryTasks();

    await record(tasks, []);

    expect(tasks.activity.size).toBe(0);
  });
});
