import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_490,
  CAMILLE_ACTOR,
  INES_ACTOR,
  SPRINT_14,
  priorityEntry,
} from '../../tasks.fixture.js';
import type { ActivityChange } from '../../value-objects/activity/activity-change.value-object.js';
import type { ActivityEntryDraft } from '../../value-objects/activity/activity-entry-draft.value-object.js';
import type { ActivityEntryState } from '../../value-objects/activity/activity-entry-state.value-object.js';
import type { ActivityWrite } from '../../value-objects/activity/activity-write.value-object.js';
import { TASK_SERVICE_ACTOR } from '../../value-objects/task/task-actor.value-object.js';
import { coalesceActivity, coalesces } from './activity-coalescing.policy.js';

/** When the candidate entry of the specs occurred. */
const CANDIDATE_AT: Date = new Date('2026-11-08T10:19:30.000Z');

/**
 * Builds a new entry of CAD-482 in Sprint 14 by Camille Martin.
 *
 * @param change - The change.
 * @param elapsedMs - Milliseconds after the candidate.
 * @param overrides - Fields to replace.
 * @returns The entry.
 */
function draft(
  change: ActivityChange,
  elapsedMs: number,
  overrides: Partial<ActivityEntryDraft> = {},
): ActivityEntryDraft {
  return {
    organizationId: ATELIER_NORD,
    taskId: CAD_482,
    listId: SPRINT_14,
    actor: CAMILLE_ACTOR,
    occurredAt: new Date(CANDIDATE_AT.getTime() + elapsedMs),
    change,
    ...overrides,
  };
}

/** The priority moved from `haute` to `urgente`. */
const toUrgente: ActivityChange = { kind: 'priority', priority: { from: 'haute', to: 'urgente' } };

/** A due-date entry: set to 2026-11-12. */
const dueSet: ActivityEntryState = priorityEntry({
  change: { kind: 'due', dueDate: { from: null, to: '2026-11-12' } },
});

describe('coalesces: only the priority and the due date merge', () => {
  it('merges priority and due, never create, status or assign', () => {
    expect(coalesces('priority')).toBe(true);
    expect(coalesces('due')).toBe(true);
    expect(coalesces('create')).toBe(false);
    expect(coalesces('status')).toBe(false);
    expect(coalesces('assign')).toBe(false);
  });
});

describe('coalesceActivity: inserts what does not merge', () => {
  it('inserts without a candidate', () => {
    const entry: ActivityEntryDraft = draft(toUrgente, 0);

    expect(coalesceActivity(entry, null)).toEqual({ action: 'insert', entry });
  });

  it('inserts a status change even right after another', () => {
    const entry: ActivityEntryDraft = draft(
      { kind: 'status', status: { from: 'review', to: 'testing' } },
      1_000,
    );
    const candidate: ActivityEntryState = priorityEntry({
      change: { kind: 'status', status: { from: 'progress', to: 'review' } },
    });

    expect(coalesceActivity(entry, candidate).action).toBe('insert');
  });

  it('inserts when another actor made the candidate', () => {
    expect(
      coalesceActivity(draft(toUrgente, 1_000, { actor: INES_ACTOR }), priorityEntry()).action,
    ).toBe('insert');
  });

  it('inserts when the actor type differs with the same id', () => {
    const candidate: ActivityEntryState = priorityEntry({
      actor: { type: 'automation', id: CAMILLE_ACTOR.id },
    });

    expect(coalesceActivity(draft(toUrgente, 1_000), candidate).action).toBe('insert');
    expect(
      coalesceActivity(draft(toUrgente, 1_000, { actor: TASK_SERVICE_ACTOR }), priorityEntry())
        .action,
    ).toBe('insert');
  });

  it('keeps distinct or unknown Git provenance in separate entries for the same integration', () => {
    const github = { type: 'git', id: 'git-integration', provider: 'github' } as const;
    const gitlab = { ...github, provider: 'gitlab' } as const;
    const legacy = { type: 'git', id: github.id } as const;
    const entry: ActivityEntryDraft = draft(toUrgente, 1_000, { actor: github });

    expect(coalesceActivity(entry, priorityEntry({ actor: gitlab })).action).toBe('insert');
    expect(coalesceActivity(entry, priorityEntry({ actor: legacy })).action).toBe('insert');
    expect(coalesceActivity(entry, priorityEntry({ actor: github })).action).toBe('update');
  });

  it('inserts when the task is now in another list', () => {
    expect(
      coalesceActivity(draft(toUrgente, 1_000, { listId: BUGS }), priorityEntry()).action,
    ).toBe('insert');
  });

  it('inserts when the candidate is of another kind or another task', () => {
    expect(coalesceActivity(draft(toUrgente, 1_000), dueSet).action).toBe('insert');
    expect(
      coalesceActivity(draft(toUrgente, 1_000), priorityEntry({ taskId: CAD_490 })).action,
    ).toBe('insert');
  });
});

describe('coalesceActivity: a 60-second sliding window from the candidate', () => {
  it('merges at exactly 60,000 ms', () => {
    expect(coalesceActivity(draft(toUrgente, 60_000), priorityEntry()).action).toBe('update');
  });

  it('inserts at 60,001 ms', () => {
    expect(coalesceActivity(draft(toUrgente, 60_001), priorityEntry()).action).toBe('insert');
  });

  it('measures the window from the occurredAt the last merge moved', () => {
    const first: ActivityWrite = coalesceActivity(draft(toUrgente, 50_000), priorityEntry());
    if (first.action !== 'update') {
      throw new Error('the first change merges');
    }
    const second: ActivityWrite = coalesceActivity(
      draft({ kind: 'priority', priority: { from: 'urgente', to: 'basse' } }, 110_000),
      first.entry,
    );

    expect(second.action).toBe('update');
  });
});

describe('coalesceActivity: a merge keeps the id and the from, and moves the to and the instant', () => {
  it('merges two priority changes into one entry', () => {
    const candidate: ActivityEntryState = priorityEntry();
    const entry: ActivityEntryDraft = draft(toUrgente, 20_000);

    expect(coalesceActivity(entry, candidate)).toEqual({
      action: 'update',
      entry: {
        ...candidate,
        change: { kind: 'priority', priority: { from: 'moyenne', to: 'urgente' } },
        occurredAt: entry.occurredAt,
      },
    });
  });

  it('merges two due-date changes into one entry', () => {
    const entry: ActivityEntryDraft = draft(
      { kind: 'due', dueDate: { from: '2026-11-12', to: '2026-11-19' } },
      5_000,
    );

    expect(coalesceActivity(entry, dueSet)).toEqual({
      action: 'update',
      entry: {
        ...dueSet,
        change: { kind: 'due', dueDate: { from: null, to: '2026-11-19' } },
        occurredAt: entry.occurredAt,
      },
    });
  });
});

describe('coalesceActivity: a merge back to the original value deletes the entry', () => {
  it('deletes a priority entry brought back to its from', () => {
    const candidate: ActivityEntryState = priorityEntry();

    expect(
      coalesceActivity(
        draft({ kind: 'priority', priority: { from: 'haute', to: 'moyenne' } }, 10_000),
        candidate,
      ),
    ).toEqual({ action: 'delete', entry: candidate });
  });

  it('deletes a due entry whose date is set then removed', () => {
    expect(
      coalesceActivity(
        draft({ kind: 'due', dueDate: { from: '2026-11-12', to: null } }, 10_000),
        dueSet,
      ),
    ).toEqual({ action: 'delete', entry: dueSet });
  });
});
