import { describe, expect, it } from 'vitest';

import { ALL_STATUSES, statusesHiding, taskState } from '../../tasks.fixture.js';
import type { StatusKey } from '../../value-objects/task/status-key.value-object.js';
import { canApplyGitStatus } from './git-status-progression.policy.js';

describe('canApplyGitStatus', () => {
  it('lets an opened pull request advance CAD-482 from progress to review', () => {
    expect(canApplyGitStatus(taskState(), 'review', ALL_STATUSES)).toBe(true);
  });

  it.each<StatusKey>(['review', 'progress', 'waiting', 'blocked', 'triage', 'backlog', 'todo'])(
    'ignores %s when CAD-482 is already in review',
    (target) => {
      expect(canApplyGitStatus(taskState({ status: 'review' }), target, ALL_STATUSES)).toBe(false);
    },
  );

  it.each<StatusKey>(['triage', 'backlog', 'todo'])(
    'lets a new branch advance %s to progress',
    (status) => {
      expect(canApplyGitStatus(taskState({ status }), 'progress', ALL_STATUSES)).toBe(true);
    },
  );

  it.each<StatusKey>(['waiting', 'progress', 'blocked'])(
    'treats %s as the same rank as the target progress',
    (status) => {
      expect(canApplyGitStatus(taskState({ status }), 'progress', ALL_STATUSES)).toBe(false);
    },
  );

  it('advances review through testing and allows a merge to reach done', () => {
    expect(canApplyGitStatus(taskState({ status: 'review' }), 'testing', ALL_STATUSES)).toBe(true);
    expect(canApplyGitStatus(taskState({ status: 'testing' }), 'done', ALL_STATUSES)).toBe(true);
    expect(canApplyGitStatus(taskState({ status: 'review' }), 'done', ALL_STATUSES)).toBe(true);
  });

  it.each<StatusKey>(['done', 'cancelled'])('preserves the terminal status %s', (status) => {
    expect(canApplyGitStatus(taskState({ status }), 'done', ALL_STATUSES)).toBe(false);
  });

  it('leaves a link-only action and a hidden target unchanged', () => {
    expect(canApplyGitStatus(taskState(), null, ALL_STATUSES)).toBe(false);
    expect(canApplyGitStatus(taskState(), 'review', statusesHiding('review'))).toBe(false);
  });

  it('keeps milestones and cancellation outside Git status changes', () => {
    expect(canApplyGitStatus(taskState({ milestone: true }), 'done', ALL_STATUSES)).toBe(false);
    expect(canApplyGitStatus(taskState(), 'cancelled', ALL_STATUSES)).toBe(false);
  });
});
