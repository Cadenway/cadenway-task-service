import { describe, expect, it } from 'vitest';
import { Goal } from '../../aggregates/goal/goal.aggregate.js';
import { InvalidGoalError } from '../../errors/goal/invalid-goal.error.js';
import type { GoalDraft } from '../../value-objects/goal/goal-draft.value-object.js';
import type { GoalLinkMeasurements } from '../../value-objects/goal/goal-link-measurements.value-object.js';
import { GoalQuarter } from '../../value-objects/goal/goal-quarter.value-object.js';
import type { GoalResult } from '../../value-objects/goal/goal-result.value-object.js';
import { measureGoal } from './goal-progress.policy.js';

const draft: GoalDraft = {
  organizationId: 'aaaaaaaa-0000-4000-8000-000000000000',
  id: '019a0010-0000-7000-8000-000000000000',
  name: 'Release SSO',
  quarter: '2028-Q1',
  ownerUserId: 'bbbbbbbb-0000-4000-8000-000000000000',
  dueDate: '2028-02-29',
};

const numberResult: Extract<GoalResult, { kind: 'number' }> = {
  id: '019a0010-0000-7000-8000-000000000001',
  label: 'Connect pilot accounts',
  kind: 'number',
  startValue: 0,
  currentValue: 5,
  targetValue: 10,
};

const checkbox: GoalResult = {
  id: '019a0010-0000-7000-8000-000000000002',
  label: 'Approve launch',
  kind: 'checkbox',
  checked: true,
};

const list: Extract<GoalResult, { kind: 'list-progress' }> = {
  id: '019a0010-0000-7000-8000-000000000003',
  label: 'Finish rollout',
  kind: 'list-progress',
  listId: 'cccccccc-0000-4000-8000-000000000000',
};

const milestone: Extract<GoalResult, { kind: 'milestone' }> = {
  id: '019a0010-0000-7000-8000-000000000004',
  label: 'Launch',
  kind: 'milestone',
  taskKey: 'SSO-38',
};

const hidden: GoalLinkMeasurements = { lists: new Map(), milestones: new Map() };

describe('measureGoal', () => {
  it.each([
    [0, -10, 10, 0],
    [0, 15, 10, 100],
    [30, 20, 10, 50],
    [30, 35, 10, 0],
    [30, -5, 10, 100],
    [10, 10, 10, 100],
    [10, 11, 10, 0],
    [10, 9, 10, 0],
    [0, 0.1, 0.4, 25],
    [-Number.MAX_VALUE, 0, Number.MAX_VALUE, 50],
    [Number.MAX_VALUE, 0, -Number.MAX_VALUE, 50],
  ])(
    'scores numeric start %s, current %s and target %s as %s',
    (startValue, currentValue, targetValue, expected) => {
      const goal = Goal.create({
        ...draft,
        results: [{ ...numberResult, startValue, currentValue, targetValue }],
      });
      const score = measureGoal(goal.snapshot, '2028-01-01', hidden);
      expect(score.progressPercent).toBe(expected);
      expect(score.results[0]).toMatchObject({ progressPercent: expected });
    },
  );

  it('weights each visible result equally and retains its observable measurement', () => {
    const goal = Goal.create({ ...draft, results: [numberResult, checkbox, list, milestone] });
    const score = measureGoal(goal.snapshot, '2028-02-15', {
      lists: new Map([[list.listId, { eligibleTaskCount: 8, doneTaskCount: 2 }]]),
      milestones: new Map([[milestone.taskKey, false]]),
    });

    expect(score).toEqual({
      progressPercent: 43.75,
      expectedProgressPercent: 50,
      health: 'at-risk',
      results: [
        { ...numberResult, progressPercent: 50 },
        { ...checkbox, progressPercent: 100 },
        { ...list, eligibleTaskCount: 8, doneTaskCount: 2, progressPercent: 25 },
        { ...milestone, reached: false, progressPercent: 0 },
      ],
    });
  });

  it('omits unreadable links and still counts a visible empty list', () => {
    const goal = Goal.create({ ...draft, results: [checkbox, list, milestone] });
    expect(measureGoal(goal.snapshot, '2028-03-31', hidden)).toMatchObject({
      results: [{ ...checkbox, progressPercent: 100 }],
      progressPercent: 100,
      health: 'achieved',
    });
    const score = measureGoal(goal.snapshot, '2028-03-31', {
      ...hidden,
      lists: new Map([[list.listId, { eligibleTaskCount: 0, doneTaskCount: 0 }]]),
    });
    expect(score.progressPercent).toBe(50);
    expect(score.results).toHaveLength(2);
    expect(score.results[1]).toMatchObject({ progressPercent: 0 });
  });

  it('scores a reached milestone and an unchecked checkbox as binary results', () => {
    const goal = Goal.create({ ...draft, results: [{ ...checkbox, checked: false }, milestone] });
    expect(
      measureGoal(goal.snapshot, '2028-01-01', {
        ...hidden,
        milestones: new Map([[milestone.taskKey, true]]),
      }).results,
    ).toEqual([
      { ...checkbox, checked: false, progressPercent: 0 },
      { ...milestone, reached: true, progressPercent: 100 },
    ]);
  });

  it('reports zero and no results when the goal has no visible key result', () => {
    const empty = Goal.create(draft);
    const linked = Goal.create({ ...draft, results: [list, milestone] });
    expect(measureGoal(linked.snapshot, '2028-03-31', hidden)).toEqual({
      progressPercent: 0,
      expectedProgressPercent: 100,
      health: 'behind',
      results: [],
    });
    expect(measureGoal(empty.snapshot, '2028-03-31', hidden)).toEqual(
      measureGoal(linked.snapshot, '2028-03-31', hidden),
    );
  });

  it.each([
    [100, 'achieved'],
    [99.99, 'on-track'],
    [45, 'on-track'],
    [44.99, 'at-risk'],
    [30, 'at-risk'],
    [29.99, 'behind'],
  ])('uses the raw score %s to classify %s at 50 expected percent', (currentValue, health) => {
    const goal = Goal.create({
      ...draft,
      results: [{ ...numberResult, currentValue, targetValue: 100 }],
    });
    const score = measureGoal(goal.snapshot, '2028-02-15', hidden);
    expect(score.health).toBe(health);
    expect(score.progressPercent).toBeCloseTo(currentValue);
  });

  it.each([
    [1, 2],
    [1, -1],
    [1.5, 1],
  ])('rejects inconsistent counts %s and %s', (eligibleTaskCount, doneTaskCount) => {
    const goal = Goal.create({ ...draft, results: [list] });
    expect(() =>
      measureGoal(goal.snapshot, '2028-01-01', {
        ...hidden,
        lists: new Map([[list.listId, { eligibleTaskCount, doneTaskCount }]]),
      }),
    ).toThrow(InvalidGoalError);
  });
});

describe('GoalQuarter', () => {
  it.each([
    ['2027-12-31', 0],
    ['2028-01-01', 0],
    ['2028-02-15', 50],
    ['2028-02-29', (59 / 90) * 100],
    ['2028-03-31', 100],
    ['2028-04-01', 100],
  ])('measures %s at %s percent through a leap-year quarter', (date, expected) => {
    expect(GoalQuarter.parse('2028-Q1').expectedProgress(date)).toBe(expected);
  });

  it('accepts the supported date range without calendar rollover', () => {
    expect(GoalQuarter.parse('0001-Q1').expectedProgress('0001-01-01')).toBe(0);
    expect(GoalQuarter.parse('0001-Q1').expectedProgress('0000-02-29')).toBe(0);
    expect(GoalQuarter.parse('9999-Q4').expectedProgress('9999-12-31')).toBe(100);
    expect(() => GoalQuarter.parse('2026-Q4').expectedProgress('2026-13-01')).toThrow(
      InvalidGoalError,
    );
  });

  it('accounts for Gregorian century rules when validating and measuring a leap day', () => {
    expect(() => {
      GoalQuarter.parse('1900-Q1').requireDueDate('1900-02-29');
    }).toThrow(expect.objectContaining({ reason: 'invalid-date' }));
    expect(GoalQuarter.parse('2000-Q1').expectedProgress('2000-02-29')).toBe((59 / 90) * 100);
  });
});
