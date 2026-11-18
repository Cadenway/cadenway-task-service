import { describe, expect, it } from 'vitest';

import { CancelReasonRequiredError } from '../../errors/task/cancel-reason-required.error.js';
import { CancelReasonUnexpectedError } from '../../errors/task/cancel-reason-unexpected.error.js';
import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import type { CancelReason } from '../../value-objects/task/cancel-reason.value-object.js';
import type { TaskState } from '../../value-objects/task/task-state.value-object.js';
import { normalizeCancelNote, resolveCancellation } from './cancellation.policy.js';

/** A task in progress. */
const inProgress: Pick<TaskState, 'status' | 'cancelReason' | 'cancelNote'> = {
  status: 'progress',
  cancelReason: null,
  cancelNote: null,
};

/** A task cancelled as a duplicate of CAD-470. */
const cancelled: Pick<TaskState, 'status' | 'cancelReason' | 'cancelNote'> = {
  status: 'cancelled',
  cancelReason: 'duplicate',
  cancelNote: 'Doublon de CAD-470',
};

describe('normalizeCancelNote: a note is trimmed and has 500 characters at most', () => {
  it('trims the note and treats an empty one as none', () => {
    expect(normalizeCancelNote('  Doublon de CAD-470 ')).toBe('Doublon de CAD-470');
    expect(normalizeCancelNote('   ')).toBeNull();
    expect(normalizeCancelNote(null)).toBeNull();
  });

  it('accepts 500 characters and refuses 501', () => {
    expect(normalizeCancelNote('a'.repeat(500))).toHaveLength(500);
    expect(() => normalizeCancelNote('a'.repeat(501))).toThrow(InvalidTaskError);
  });
});

describe('resolveCancellation: becoming cancelled needs a reason', () => {
  it('takes the reason and the note of a creation cancelled', () => {
    expect(
      resolveCancellation(null, 'cancelled', { cancelReason: 'scope', cancelNote: ' Hors V1 ' }),
    ).toEqual({ cancelReason: 'scope', cancelNote: 'Hors V1' });
  });

  it('refuses a creation cancelled without a reason', () => {
    expect(() =>
      resolveCancellation(null, 'cancelled', { cancelReason: null, cancelNote: null }),
    ).toThrow(CancelReasonRequiredError);
  });

  it('refuses a task that becomes cancelled with the reason left out or null', () => {
    expect(() => resolveCancellation(inProgress, 'cancelled', {})).toThrow(
      CancelReasonRequiredError,
    );
    expect(() => resolveCancellation(inProgress, 'cancelled', { cancelReason: null })).toThrow(
      CancelReasonRequiredError,
    );
  });

  it('takes no note when a task becomes cancelled without one', () => {
    expect(resolveCancellation(inProgress, 'cancelled', { cancelReason: 'wontdo' })).toEqual({
      cancelReason: 'wontdo',
      cancelNote: null,
    });
  });

  it('refuses a reason that is not one of the four', () => {
    expect(() =>
      resolveCancellation(inProgress, 'cancelled', { cancelReason: 'later' as CancelReason }),
    ).toThrow(InvalidTaskError);
  });
});

describe('resolveCancellation: on a cancelled task, the reason and the note change alone', () => {
  it('keeps both when the patch leaves them out', () => {
    expect(resolveCancellation(cancelled, 'cancelled', {})).toEqual({
      cancelReason: 'duplicate',
      cancelNote: 'Doublon de CAD-470',
    });
  });

  it('changes the reason and keeps the note', () => {
    expect(resolveCancellation(cancelled, 'cancelled', { cancelReason: 'obsolete' })).toEqual({
      cancelReason: 'obsolete',
      cancelNote: 'Doublon de CAD-470',
    });
  });

  it('clears the note with null', () => {
    expect(resolveCancellation(cancelled, 'cancelled', { cancelNote: null })).toEqual({
      cancelReason: 'duplicate',
      cancelNote: null,
    });
  });

  it('refuses to clear the reason of a task that stays cancelled', () => {
    expect(() => resolveCancellation(cancelled, 'cancelled', { cancelReason: null })).toThrow(
      CancelReasonRequiredError,
    );
  });
});

describe('resolveCancellation: a task that is not cancelled has neither reason nor note', () => {
  it('clears both when the task leaves cancelled', () => {
    expect(resolveCancellation(cancelled, 'todo', {})).toEqual({
      cancelReason: null,
      cancelNote: null,
    });
  });

  it('refuses a reason or a note for a status other than cancelled', () => {
    expect(() => resolveCancellation(inProgress, 'review', { cancelReason: 'scope' })).toThrow(
      CancelReasonUnexpectedError,
    );
    expect(() => resolveCancellation(cancelled, 'todo', { cancelNote: 'Repris' })).toThrow(
      CancelReasonUnexpectedError,
    );
    expect(() =>
      resolveCancellation(null, 'todo', { cancelReason: 'duplicate', cancelNote: null }),
    ).toThrow(CancelReasonUnexpectedError);
  });

  it('accepts null and an empty note as none', () => {
    expect(
      resolveCancellation(inProgress, 'review', { cancelReason: null, cancelNote: '  ' }),
    ).toEqual({ cancelReason: null, cancelNote: null });
  });
});
