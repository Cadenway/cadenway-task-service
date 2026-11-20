import { describe, expect, it } from 'vitest';

import { InvalidGoalError } from '../../../domain/errors/goal/invalid-goal.error.js';
import { GoalError } from '../../models/goal/goal-error.model.js';
import { rethrowGoalFailure } from './goal-failure.service.js';

describe('rethrowGoalFailure', () => {
  it.each([
    'invalid-goal',
    'invalid-quarter',
    'invalid-date',
    'invalid-result',
    'result-not-found',
    'due-date-outside-quarter',
    'result-limit-reached',
    'result-patch-invalid',
  ] as const)('exposes the domain refusal %s through the application error', (reason) => {
    expect(() => rethrowGoalFailure(new InvalidGoalError(reason, 'domain'))).toThrow(GoalError);
    expect(() => rethrowGoalFailure(new InvalidGoalError(reason, 'domain'))).toThrow(
      expect.objectContaining({ failure: { reason } }),
    );
  });

  it('keeps unexpected internal errors intact', () => {
    const error = new InvalidGoalError('invalid-link-measurement', 'inconsistent input');
    expect(() => rethrowGoalFailure(error)).toThrow(error);
    const unknown = new Error('database failure');
    expect(() => rethrowGoalFailure(unknown)).toThrow(unknown);
  });
});
