import { describe, expect, it } from 'vitest';

import { MilestoneDatesInvalidError } from '../../../domain/errors/task/milestone-dates-invalid.error.js';
import { MilestoneStatusInvalidError } from '../../../domain/errors/task/milestone-status-invalid.error.js';
import { RecurrenceAlreadySpawnedError } from '../../../domain/errors/task/recurrence-already-spawned.error.js';
import { RecurrenceDateOutOfRangeError } from '../../../domain/errors/task/recurrence-date-out-of-range.error.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';
import { TaskRuleGuard } from './task-rule-guard.service.js';

describe('TaskRuleGuard', () => {
  it.each([
    [new MilestoneStatusInvalidError(), 'milestone-status-invalid'],
    [new MilestoneDatesInvalidError(), 'milestone-dates-invalid'],
    [new RecurrenceAlreadySpawnedError(), 'recurrence-already-spawned'],
    [new RecurrenceDateOutOfRangeError(), 'recurrence-date-out-of-range'],
  ] as const)('maps the planning refusal %s', (error, reason) => {
    try {
      new TaskRuleGuard().apply(() => {
        throw error;
      });
    } catch (refusal) {
      expect(refusal).toBeInstanceOf(TaskRefusal);
      expect(refusal).toMatchObject({ refusal: { reason } });
      return;
    }
    throw new Error('The domain refusal was expected.');
  });
});
