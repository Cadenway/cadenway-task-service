import { MILESTONE_STATUS_KEYS } from '@cadenway/contracts';
import { describe, expect, it } from 'vitest';

import { MilestoneDatesInvalidError } from '../../errors/task/milestone-dates-invalid.error.js';
import { MilestoneStatusInvalidError } from '../../errors/task/milestone-status-invalid.error.js';
import type { MilestoneFields } from '../../value-objects/task/milestone-fields.value-object.js';
import { STATUS_KEYS } from '../../value-objects/task/status-key.value-object.js';
import {
  hasReachedMilestone,
  requireValidMilestone,
  resolveMilestone,
} from './milestone.policy.js';

const existingTask: MilestoneFields = {
  milestone: false,
  status: 'review',
  dueDate: '2026-11-20',
  startDate: '2026-11-18',
  estimateMinutes: 180,
};

const milestone: MilestoneFields = {
  milestone: true,
  status: 'todo',
  dueDate: '2026-11-20',
  startDate: '2026-11-20',
  estimateMinutes: null,
};

describe('resolveMilestone', () => {
  it('normalizes inherited status, dates and estimate when converting an ordinary task', () => {
    expect(resolveMilestone(existingTask, { milestone: true })).toEqual(milestone);
    expect(resolveMilestone({ ...existingTask, status: 'blocked' }, { milestone: true })).toEqual({
      ...milestone,
      status: 'blocked',
    });
  });

  it('accepts an undated milestone on creation or when clearing its due date', () => {
    expect(resolveMilestone(null, { milestone: true })).toEqual({
      ...milestone,
      dueDate: null,
      startDate: null,
    });
    expect(resolveMilestone(milestone, { dueDate: null })).toEqual({
      ...milestone,
      dueDate: null,
      startDate: null,
    });
  });

  it('aligns the inherited start with a new due date and accepts an explicit equal start', () => {
    expect(resolveMilestone(milestone, { dueDate: '2026-11-24' })).toEqual({
      ...milestone,
      dueDate: '2026-11-24',
      startDate: '2026-11-24',
    });
    expect(resolveMilestone(milestone, { startDate: '2026-11-20', estimateMinutes: null })).toEqual(
      milestone,
    );
  });

  it.each([
    { startDate: '2026-11-19' },
    { startDate: null },
    { dueDate: null, startDate: '2026-11-20' },
    { dueDate: '2026-02-29' },
    { estimateMinutes: 60 },
  ])(
    'refuses an explicit field that conflicts with the final milestone dates or estimate',
    (patch) => {
      expect(() => resolveMilestone(milestone, patch)).toThrow(MilestoneDatesInvalidError);
    },
  );

  it('admits exactly the four published milestone statuses', () => {
    const valid = STATUS_KEYS.filter((status) => {
      try {
        resolveMilestone(null, { milestone: true, status });
        return true;
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(MilestoneStatusInvalidError);
        return false;
      }
    });
    expect(valid).toEqual(MILESTONE_STATUS_KEYS);
    expect(() => resolveMilestone(existingTask, { milestone: true, status: 'review' })).toThrow(
      MilestoneStatusInvalidError,
    );
  });

  it('leaves ordinary fields to the normal task update when an existing milestone is disabled', () => {
    expect(resolveMilestone(milestone, { milestone: false, status: 'progress' })).toBeNull();
    expect(resolveMilestone(existingTask, { dueDate: '2026-11-27' })).toBeNull();
  });
});

describe('requireValidMilestone', () => {
  it('refuses corrupt stored milestone fields instead of normalizing them', () => {
    expect(() => {
      requireValidMilestone(milestone);
    }).not.toThrow();
    expect(() => {
      requireValidMilestone(existingTask);
    }).not.toThrow();
    expect(() => {
      requireValidMilestone({ ...milestone, status: 'review' });
    }).toThrow(MilestoneStatusInvalidError);
    expect(() => {
      requireValidMilestone({ ...milestone, startDate: null });
    }).toThrow(MilestoneDatesInvalidError);
  });
});

describe('hasReachedMilestone', () => {
  it('matches a transition to done when the resulting task is a milestone', () => {
    const reached = { milestone: true, status: 'done' } as const;
    expect(hasReachedMilestone('todo', reached)).toBe(true);
    expect(hasReachedMilestone('review', reached)).toBe(true);
    expect(hasReachedMilestone('done', reached)).toBe(false);
    expect(hasReachedMilestone('todo', { milestone: true, status: 'cancelled' })).toBe(false);
    expect(hasReachedMilestone('todo', { milestone: false, status: 'done' })).toBe(false);
  });
});
