import { describe, expect, it } from 'vitest';
import { InvalidGoalError } from '../../errors/goal/invalid-goal.error.js';
import type { GoalDraft } from '../../value-objects/goal/goal-draft.value-object.js';
import type { GoalResult } from '../../value-objects/goal/goal-result.value-object.js';
import { Goal } from './goal.aggregate.js';

const draft: GoalDraft = {
  organizationId: 'aaaaaaaa-0000-4000-8000-000000000000',
  id: '019a0010-0000-7000-8000-000000000000',
  name: '  Release SSO  ',
  quarter: '2028-Q1',
  ownerUserId: 'bbbbbbbb-0000-4000-8000-000000000000',
  dueDate: '2028-02-29',
};

const checkbox: GoalResult = {
  id: '019a0010-0000-7000-8000-000000000001',
  label: '  Get approval  ',
  kind: 'checkbox',
  checked: true,
};

const number: GoalResult = {
  id: '019a0010-0000-7000-8000-000000000002',
  label: 'Connect pilot accounts',
  kind: 'number',
  startValue: 0,
  currentValue: 5,
  targetValue: 10,
};

const list: GoalResult = {
  id: '019a0010-0000-7000-8000-000000000003',
  label: 'Finish rollout',
  kind: 'list-progress',
  listId: 'cccccccc-0000-4000-8000-000000000000',
};

const milestone: GoalResult = {
  id: '019a0010-0000-7000-8000-000000000004',
  label: 'Launch',
  kind: 'milestone',
  taskKey: 'SSO-38',
};

describe('Goal', () => {
  it('normalizes display text and defaults to organization placement at version one', () => {
    const goal = Goal.create({ ...draft, results: [checkbox, number, list, milestone] });

    expect(goal.snapshot).toEqual({
      ...draft,
      name: 'Release SSO',
      spaceId: null,
      version: 1,
      results: [{ ...checkbox, label: 'Get approval' }, number, list, milestone],
    });
    expect(Goal.create(draft).snapshot.results).toEqual([]);
  });

  it('accepts 300 Unicode code points and rejects empty or longer text', () => {
    const name = '😀'.repeat(300);
    expect(Goal.create({ ...draft, name }).snapshot.name).toBe(name);
    expect(() => Goal.create({ ...draft, name: `${name}😀` })).toThrow(InvalidGoalError);
    expect(() => Goal.create({ ...draft, results: [{ ...checkbox, label: '   ' }] })).toThrow(
      InvalidGoalError,
    );
  });

  it('keeps placement fixed and increments the version for a metadata change', () => {
    const spaceId = 'dddddddd-0000-4000-8000-000000000000';
    const goal = Goal.create({ ...draft, spaceId });
    const updated = goal.update({ name: 'Launch SSO', dueDate: '2028-03-31' });

    expect(updated.snapshot).toEqual({
      ...goal.snapshot,
      name: 'Launch SSO',
      dueDate: '2028-03-31',
      version: 2,
    });
    expect(updated.update({ name: ' Launch SSO ' })).toBe(updated);
    expect(updated.update({})).toBe(updated);
    const relocation = { name: 'Later goal', quarter: '2028-Q2', spaceId: null };
    expect(() => updated.update(relocation)).toThrow(InvalidGoalError);
  });

  it.each(['2028-04-01', '2027-12-31'])('rejects deadline %s outside the quarter', (dueDate) => {
    expect(() => Goal.create({ ...draft, dueDate })).toThrow(
      expect.objectContaining({ reason: 'due-date-outside-quarter' }),
    );
    expect(() => Goal.create(draft).update({ dueDate })).toThrow(
      expect.objectContaining({ reason: 'due-date-outside-quarter' }),
    );
  });

  it('rejects invalid quarter, dates and identities', () => {
    expect(() => Goal.create({ ...draft, quarter: '0000-Q1' })).toThrow(
      expect.objectContaining({ reason: 'invalid-quarter' }),
    );
    expect(() => Goal.create({ ...draft, dueDate: '2027-02-29' })).toThrow(
      expect.objectContaining({ reason: 'invalid-date' }),
    );
    expect(() => Goal.create({ ...draft, id: draft.ownerUserId })).toThrow(InvalidGoalError);
    expect(() => Goal.create({ ...draft, organizationId: '' })).toThrow(InvalidGoalError);
  });

  it('preserves false and zero when changing results and leaves no-ops at the same version', () => {
    const goal = Goal.create({ ...draft, results: [checkbox, number] });
    const unchecked = goal.updateResult(checkbox.id, { checked: false });
    const reset = unchecked.updateResult(number.id, { currentValue: 0 });
    const relabelled = reset.updateResult(number.id, { label: ' Pilot accounts ' });

    expect(unchecked.snapshot.results[0]).toMatchObject({ checked: false });
    expect(reset.snapshot.results[1]).toMatchObject({ currentValue: 0, targetValue: 10 });
    expect(relabelled.snapshot.results[1]).toMatchObject({ label: 'Pilot accounts' });
    expect(relabelled.snapshot.version).toBe(4);
    expect(relabelled.updateResult(number.id, { label: ' Pilot accounts ', currentValue: 0 })).toBe(
      relabelled,
    );
  });

  it('rejects wrong-kind patches, endpoint changes and result operations on absent IDs', () => {
    const goal = Goal.create({ ...draft, results: [checkbox, number, list] });
    const relink = { label: 'New list', listId: draft.id };

    expect(() => goal.updateResult(checkbox.id, { currentValue: 25 })).toThrow(
      expect.objectContaining({ reason: 'result-patch-invalid' }),
    );
    expect(() => goal.updateResult(number.id, { checked: false })).toThrow(InvalidGoalError);
    expect(() => goal.updateResult(list.id, relink)).toThrow(InvalidGoalError);
    expect(() => goal.updateResult(milestone.id, {})).toThrow(
      expect.objectContaining({ reason: 'result-not-found' }),
    );
    expect(() => goal.removeResult(milestone.id)).toThrow(
      expect.objectContaining({ reason: 'result-not-found' }),
    );
  });

  it('caps all result writes at 20 and releases capacity when removing a result', () => {
    const results = Array.from({ length: 20 }, (_, index): GoalResult => ({
      ...checkbox,
      id: `019a0010-0000-7000-8000-${String(index + 100).padStart(12, '0')}`,
    }));
    const goal = Goal.create({ ...draft, results });
    const firstResult = goal.snapshot.results[0];
    if (firstResult === undefined) throw new Error('at least one initial result is required');

    expect(() => Goal.create({ ...draft, results: [...results, number] })).toThrow(
      expect.objectContaining({ reason: 'result-limit-reached' }),
    );
    expect(() => goal.addResult(number)).toThrow(
      expect.objectContaining({ reason: 'result-limit-reached' }),
    );
    expect(goal.removeResult(firstResult.id).addResult(number).snapshot).toMatchObject({
      version: 3,
      results: [
        ...results.slice(1).map((result) => ({ ...result, label: 'Get approval' })),
        number,
      ],
    });
  });

  it('restores a valid state as an immutable snapshot', () => {
    const mutableResult = { ...checkbox };
    const results = [mutableResult];
    const state = { ...draft, spaceId: null, version: 7, results };
    const goal = Goal.reconstitute(state);

    mutableResult.label = 'Changed outside the aggregate';
    results.pop();
    expect(goal.snapshot.results).toEqual([{ ...checkbox, label: 'Get approval' }]);
    expect(Object.isFrozen(goal.snapshot)).toBe(true);
    expect(Object.isFrozen(goal.snapshot.results)).toBe(true);
    expect(Object.isFrozen(goal.snapshot.results[0])).toBe(true);
    expect(goal.update({ name: 'Revised goal' }).snapshot.version).toBe(8);
  });

  it('refuses invalid restored versions, duplicate IDs and invalid kind-specific values', () => {
    const state = Goal.create(draft).snapshot;
    expect(() => Goal.reconstitute({ ...state, version: 0 })).toThrow(InvalidGoalError);
    expect(() => Goal.reconstitute({ ...state, results: Array<GoalResult>(1) })).toThrow(
      InvalidGoalError,
    );
    expect(() => Goal.reconstitute({ ...state, results: [checkbox, checkbox] })).toThrow(
      InvalidGoalError,
    );
    expect(() => Goal.create({ ...draft, results: [checkbox] }).addResult(checkbox)).toThrow(
      InvalidGoalError,
    );
    expect(() =>
      Goal.reconstitute({ ...state, results: [{ ...number, currentValue: NaN }] }),
    ).toThrow(InvalidGoalError);
    expect(() => Goal.create({ ...draft, results: [{ ...milestone, taskKey: 'SSO-0' }] })).toThrow(
      InvalidGoalError,
    );
  });
});
