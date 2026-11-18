import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { StatusHiddenError } from '../../errors/task/status-hidden.error.js';
import { ALL_STATUSES, statusesHiding } from '../../tasks.fixture.js';
import type { StatusKey } from '../../value-objects/task/status-key.value-object.js';
import { checkStatusAvailable } from './status-availability.policy.js';

describe('checkStatusAvailable: a new status must be used by the space', () => {
  it('accepts any used status, from any other', () => {
    expect(() => {
      checkStatusAvailable('done', 'triage', ALL_STATUSES);
    }).not.toThrow();
  });

  it('refuses a new status the space hides, naming it', () => {
    let error: unknown;
    try {
      checkStatusAvailable('testing', 'review', statusesHiding('testing'));
    } catch (caught: unknown) {
      error = caught;
    }

    expect(error).toBeInstanceOf(StatusHiddenError);
    expect((error as StatusHiddenError).status).toBe('testing');
  });

  it('refuses a hidden status at a creation', () => {
    expect(() => {
      checkStatusAvailable('triage', null, statusesHiding('triage'));
    }).toThrow(StatusHiddenError);
  });

  it('keeps a status the task already has, even when the space hides it', () => {
    expect(() => {
      checkStatusAvailable('testing', 'testing', statusesHiding('testing'));
    }).not.toThrow();
  });

  it('refuses a status that is not one of the ten keys', () => {
    expect(() => {
      checkStatusAvailable('archived' as StatusKey, 'todo', ALL_STATUSES);
    }).toThrow(InvalidTaskError);
  });
});
