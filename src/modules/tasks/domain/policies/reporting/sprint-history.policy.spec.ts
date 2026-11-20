import { describe, expect, it } from 'vitest';

import type { SprintHistoryInput } from '../../value-objects/reporting/sprint-history-input.value-object.js';
import { TaskKey } from '../../value-objects/task/task-key.value-object.js';
import { SprintHistory } from './sprint-history.policy.js';

const COVERAGE = new Date('2026-11-03T00:00:00.000Z');
const BEFORE_COVERAGE = new Date('2026-11-02T12:00:00.000Z');
const AT_OPEN = new Date('2026-11-03T06:00:00.000Z');
const MIDDLE = new Date('2026-11-05T06:00:00.000Z');
const AT_CLOSE = new Date('2026-11-07T06:00:00.000Z');
const SPRINT = { listId: 'sprint-14', spaceId: 'produit' };

/** The live row of the caller-visible task from the Sprint 14 fixture. */
function task(
  overrides: Partial<SprintHistoryInput['currentTasks'][number]> = {},
): SprintHistoryInput['currentTasks'][number] {
  return {
    ...SPRINT,
    taskId: 'task-a',
    key: TaskKey.parse('CAD-482'),
    createdAt: BEFORE_COVERAGE,
    unchangedSinceCoverage: true,
    name: 'Revoir le formulaire',
    status: 'todo',
    estimateMinutes: 180,
    parentId: null,
    milestone: false,
    archivedAt: null,
    trashEntryId: null,
    ...overrides,
  };
}

/** A full task change at a given ledger position. */
function taskFact(
  overrides: Partial<SprintHistoryInput['taskFacts'][number]> = {},
): SprintHistoryInput['taskFacts'][number] {
  return { ...task(), recordedAt: MIDDLE, sequence: 2n, baseline: false, ...overrides };
}

/** The numeric Points definition currently stored in the sprint's space. */
function field(
  overrides: Partial<SprintHistoryInput['currentFields'][number]> = {},
): SprintHistoryInput['currentFields'][number] {
  return {
    spaceId: SPRINT.spaceId,
    fieldId: 'points-a',
    createdAt: BEFORE_COVERAGE,
    unchangedSinceCoverage: true,
    designated: true,
    retiredAt: null,
    ...overrides,
  };
}

/** A designation or retirement change at a given ledger position. */
function fieldFact(
  overrides: Partial<SprintHistoryInput['fieldFacts'][number]> = {},
): SprintHistoryInput['fieldFacts'][number] {
  return { ...field(), recordedAt: MIDDLE, sequence: 2n, baseline: false, ...overrides };
}

/** A current numeric custom-field value proven unchanged since coverage. */
function value(
  overrides: Partial<SprintHistoryInput['currentValues'][number]> = {},
): SprintHistoryInput['currentValues'][number] {
  return {
    taskId: 'task-a',
    fieldId: 'points-a',
    numberValue: 0,
    unchangedSinceCoverage: true,
    ...overrides,
  };
}

/** A numeric change or a removal at a given ledger position. */
function valueFact(
  overrides: Partial<SprintHistoryInput['valueFacts'][number]> = {},
): SprintHistoryInput['valueFacts'][number] {
  return { ...value(), recordedAt: MIDDLE, sequence: 2n, baseline: false, ...overrides };
}

/** Builds a bounded batch of raw facts and currently readable task rows. */
function history(overrides: Partial<SprintHistoryInput> = {}): SprintHistory {
  return new SprintHistory({
    coverageStartedAt: COVERAGE,
    currentTasks: [task()],
    currentFields: [field()],
    currentValues: [value()],
    taskFacts: [],
    fieldFacts: [],
    valueFacts: [],
    ...overrides,
  });
}

describe('SprintHistory', () => {
  it('distinguishes an uncovered cutoff from a covered empty sprint', () => {
    expect(history().at(SPRINT, BEFORE_COVERAGE)).toBeNull();
    expect(history({ coverageStartedAt: null }).at(SPRINT, AT_OPEN)).toBeNull();
    expect(history({ currentTasks: [] }).at(SPRINT, AT_OPEN)).toEqual([]);
  });

  it('reads a proved-unchanged live row and a zero value at the initial coverage', () => {
    expect(history().at(SPRINT, COVERAGE)).toMatchObject([
      { key: TaskKey.parse('CAD-482'), status: 'todo', estimateMinutes: 180, customPoints: 0 },
    ]);
  });

  it('uses a late-recorded baseline at coverage and stops a moved task contributing at the move', () => {
    const historyByCutoff = history({
      currentTasks: [task({ listId: 'sprint-15', status: 'done', unchangedSinceCoverage: false })],
      taskFacts: [
        taskFact({ listId: 'sprint-15', name: 'Après le déplacement', status: 'done' }),
        taskFact({ recordedAt: AT_CLOSE, sequence: 1n, baseline: true }),
      ],
    });

    expect(historyByCutoff.at(SPRINT, AT_OPEN)).toMatchObject([
      { name: 'Revoir le formulaire', status: 'todo' },
    ]);
    expect(historyByCutoff.at(SPRINT, MIDDLE)).toEqual([]);
    expect(historyByCutoff.at({ ...SPRINT, listId: 'sprint-15' }, AT_CLOSE)).toMatchObject([
      { name: 'Après le déplacement', status: 'done' },
    ]);
  });

  it('uses the highest sequence at a shared timestamp and ignores later facts', () => {
    const historyByCutoff = history({
      taskFacts: [
        taskFact({ sequence: 4n, recordedAt: AT_CLOSE, status: 'review' }),
        taskFact({ sequence: 3n, status: 'done' }),
        taskFact({ sequence: 2n, status: 'progress' }),
        taskFact({ sequence: 1n, status: 'todo', baseline: true }),
      ],
    });

    expect(historyByCutoff.at(SPRINT, MIDDLE)).toMatchObject([{ status: 'done' }]);
    expect(historyByCutoff.at(SPRINT, AT_CLOSE)).toMatchObject([{ status: 'review' }]);
  });

  it('uses a real write stamped at activation before a delayed baseline with a higher sequence', () => {
    const historyByCutoff = history({
      taskFacts: [
        taskFact({ recordedAt: COVERAGE, sequence: 1n, status: 'progress' }),
        taskFact({ recordedAt: AT_CLOSE, sequence: 2n, status: 'todo', baseline: true }),
      ],
    });

    expect(historyByCutoff.at(SPRINT, COVERAGE)).toMatchObject([{ status: 'progress' }]);
  });

  it('does not treat post-coverage inserts as earlier rows even if row creation time was earlier', () => {
    const historyByCutoff = history({
      currentTasks: [task({ createdAt: AT_OPEN, unchangedSinceCoverage: false })],
      taskFacts: [taskFact()],
    });

    expect(historyByCutoff.at(SPRINT, AT_OPEN)).toEqual([]);
    expect(historyByCutoff.at(SPRINT, MIDDLE)).toMatchObject([{ status: 'todo' }]);
  });

  it('returns a coverage gap for a changed pre-coverage task with no baseline', () => {
    expect(
      history({ currentTasks: [task({ unchangedSinceCoverage: false })] }).at(SPRINT, AT_OPEN),
    ).toBeNull();
    expect(history({ taskFacts: [taskFact()] }).at(SPRINT, AT_OPEN)).toBeNull();
  });

  it('ignores facts for tasks outside the currently visible and unpurged set', () => {
    expect(
      history({
        currentTasks: [],
        taskFacts: [taskFact({ baseline: true })],
        valueFacts: [valueFact({ baseline: true })],
      }).at(SPRINT, AT_OPEN),
    ).toEqual([]);
  });

  it('excludes historical subtasks without asking for the parent key', () => {
    const historyByCutoff = history({
      taskFacts: [
        taskFact({ parentId: 'deleted-parent', baseline: true }),
        taskFact({ sequence: 3n }),
      ],
    });

    expect(historyByCutoff.at(SPRINT, AT_OPEN)).toEqual([]);
    expect(historyByCutoff.at(SPRINT, MIDDLE)).toMatchObject([{ parentKey: null }]);
  });

  it('preserves milestone, archive and trash state at the evaluated instant', () => {
    const historyByCutoff = history({
      taskFacts: [
        taskFact({ sequence: 1n, baseline: true, milestone: true }),
        taskFact({ sequence: 2n, archivedAt: MIDDLE }),
        taskFact({ sequence: 3n, recordedAt: AT_CLOSE, trashEntryId: 'trash-a' }),
      ],
    });

    expect(historyByCutoff.at(SPRINT, AT_OPEN)).toMatchObject([
      { milestone: true, archived: false, trashed: false },
    ]);
    expect(historyByCutoff.at(SPRINT, MIDDLE)).toMatchObject([
      { milestone: false, archived: true, trashed: false },
    ]);
    expect(historyByCutoff.at(SPRINT, AT_CLOSE)).toMatchObject([
      { milestone: false, archived: false, trashed: true },
    ]);
  });

  it('preserves zero and stops using a value after its tombstone', () => {
    const historyByCutoff = history({
      currentValues: [value({ numberValue: 5, unchangedSinceCoverage: false })],
      valueFacts: [
        valueFact({ sequence: 1n, baseline: true }),
        valueFact({ sequence: 2n, numberValue: null }),
        valueFact({ sequence: 3n, recordedAt: AT_CLOSE, numberValue: 5 }),
      ],
    });

    expect(historyByCutoff.at(SPRINT, AT_OPEN)).toMatchObject([{ customPoints: 0 }]);
    expect(historyByCutoff.at(SPRINT, MIDDLE)).toMatchObject([{ customPoints: null }]);
    expect(historyByCutoff.at(SPRINT, AT_CLOSE)).toMatchObject([{ customPoints: 5 }]);
  });

  it('does not use a live value changed after the frozen cursor snapshot', () => {
    const historyByCutoff = history({
      currentValues: [value({ numberValue: 5, unchangedSinceCoverage: false })],
    });

    expect(historyByCutoff.at(SPRINT, AT_OPEN)).toMatchObject([{ customPoints: null }]);
  });

  it('does not apply a later numeric insert to earlier covered dates', () => {
    const historyByCutoff = history({
      currentValues: [value({ numberValue: 5 })],
      valueFacts: [valueFact({ numberValue: 5 })],
    });

    expect(historyByCutoff.at(SPRINT, AT_OPEN)).toMatchObject([{ customPoints: null }]);
    expect(historyByCutoff.at(SPRINT, MIDDLE)).toMatchObject([{ customPoints: 5 }]);
  });

  it('uses a field only during its designation lifetime and ignores other spaces', () => {
    const replacement = field({ fieldId: 'points-b', createdAt: MIDDLE });
    const historyByCutoff = history({
      currentFields: [
        field({ designated: false, retiredAt: MIDDLE, unchangedSinceCoverage: false }),
        replacement,
        field({ fieldId: 'points-c', spaceId: 'design' }),
      ],
      currentValues: [
        value(),
        value({ fieldId: 'points-b', numberValue: 9, unchangedSinceCoverage: false }),
      ],
      fieldFacts: [
        fieldFact({ sequence: 1n, baseline: true }),
        fieldFact({ sequence: 2n, designated: false, retiredAt: MIDDLE }),
        fieldFact({ ...replacement, sequence: 3n, recordedAt: AT_CLOSE }),
      ],
      valueFacts: [valueFact({ fieldId: 'points-b', numberValue: 9 })],
    });

    expect(historyByCutoff.at(SPRINT, AT_OPEN)).toMatchObject([{ customPoints: 0 }]);
    expect(historyByCutoff.at(SPRINT, MIDDLE)).toMatchObject([{ customPoints: null }]);
    expect(historyByCutoff.at(SPRINT, AT_CLOSE)).toMatchObject([{ customPoints: 9 }]);
  });

  it('returns a gap when the designation at opening is unavailable or ambiguous', () => {
    expect(
      history({ currentFields: [field({ unchangedSinceCoverage: false })] }).at(SPRINT, AT_OPEN),
    ).toBeNull();
    expect(
      history({ currentFields: [field(), field({ fieldId: 'points-b' })] }).at(SPRINT, AT_OPEN),
    ).toBeNull();
  });

  it('keeps an empty or ineligible scope covered when the designation is unavailable', () => {
    const currentFields = [field({ unchangedSinceCoverage: false })];
    expect(history({ currentTasks: [], currentFields }).at(SPRINT, AT_OPEN)).toEqual([]);
    expect(
      history({ currentTasks: [task({ archivedAt: BEFORE_COVERAGE })], currentFields }).at(
        SPRINT,
        AT_OPEN,
      ),
    ).toMatchObject([{ archived: true, customPoints: null }]);
  });
});
