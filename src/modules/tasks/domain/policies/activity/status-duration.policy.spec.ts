import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import type { StatusHistoryEntry } from '../../value-objects/activity/status-history-entry.value-object.js';
import type { StatusKey } from '../../value-objects/task/status-key.value-object.js';
import { StatusDurationHistory } from './status-duration.policy.js';

const CREATION: Date = new Date('2026-11-08T08:00:00.000Z');
const OBSERVATION: Date = new Date('2026-11-08T12:00:00.000Z');
const HOUR: number = 3_600_000;

/** Makes a history fact with an offset in hours from creation. */
function creation(initialStatus?: StatusKey): StatusHistoryEntry {
  return { id: 'a', occurredAt: CREATION, change: { kind: 'create' }, initialStatus };
}

/** Makes a transition with the supplied ordered ID. */
function transition(id: string, hour: number, from: StatusKey, to: StatusKey): StatusHistoryEntry {
  return {
    id,
    occurredAt: new Date(CREATION.getTime() + hour * HOUR),
    change: { kind: 'status', status: { from, to } },
  };
}

/** Starts at the current status observed at noon for CAD-482. */
function cad482(status: StatusKey): StatusDurationHistory {
  return new StatusDurationHistory({ status, createdAt: CREATION }, OBSERVATION);
}

describe('StatusDurationHistory', () => {
  it('covers the initial status from creation without a transition', () => {
    const history: StatusDurationHistory = cad482('todo');

    expect(history.include(creation('todo'))).toBe(true);

    expect(history.summarize()).toEqual({
      observedAt: OBSERVATION,
      coverageStartedAt: CREATION,
      complete: true,
      durations: [{ status: 'todo', durationMilliseconds: 4 * HOUR, active: true }],
    });
  });

  it('uses the task creation instant when the activity timestamp was truncated', () => {
    const history: StatusDurationHistory = cad482('todo');
    const occurredAt = new Date(CREATION.getTime() - 1);

    expect(history.include({ ...creation('todo'), occurredAt })).toBe(true);

    expect(history.summarize()).toMatchObject({
      coverageStartedAt: CREATION,
      complete: true,
      durations: [{ status: 'todo', durationMilliseconds: 4 * HOUR, active: true }],
    });
  });

  it('sums repeated visits in first-appearance order and includes terminal elapsed time', () => {
    const history: StatusDurationHistory = cad482('done');
    expect(history.include(transition('d', 3, 'progress', 'done'))).toBe(true);
    expect(history.include(transition('c', 2, 'todo', 'progress'))).toBe(true);
    expect(history.include(transition('b', 1, 'progress', 'todo'))).toBe(true);
    expect(history.include(creation('progress'))).toBe(true);

    expect(history.summarize()).toEqual({
      observedAt: OBSERVATION,
      coverageStartedAt: CREATION,
      complete: true,
      durations: [
        { status: 'progress', durationMilliseconds: 2 * HOUR, active: false },
        { status: 'todo', durationMilliseconds: HOUR, active: false },
        { status: 'done', durationMilliseconds: HOUR, active: false },
      ],
    });
  });

  it('starts a legacy task at its earliest continuous transition into a known state', () => {
    const history: StatusDurationHistory = cad482('review');
    const first = transition('b', 1, 'todo', 'progress');
    expect(history.include(transition('c', 2, 'progress', 'review'))).toBe(true);
    expect(history.include(first)).toBe(true);
    expect(history.include(creation())).toBe(false);

    expect(history.summarize()).toEqual({
      observedAt: OBSERVATION,
      coverageStartedAt: first.occurredAt,
      complete: false,
      durations: [
        { status: 'progress', durationMilliseconds: HOUR, active: false },
        { status: 'review', durationMilliseconds: 2 * HOUR, active: true },
      ],
    });
  });

  it('stops at the first broken link and retains only the reliable suffix', () => {
    const history: StatusDurationHistory = cad482('progress');
    const latest = transition('d', 3, 'todo', 'progress');
    expect(history.include(latest)).toBe(true);
    expect(history.include(transition('c', 2, 'todo', 'review'))).toBe(false);
    expect(history.include(creation('todo'))).toBe(false);

    expect(history.summarize()).toEqual({
      observedAt: OBSERVATION,
      coverageStartedAt: latest.occurredAt,
      complete: false,
      durations: [{ status: 'progress', durationMilliseconds: HOUR, active: true }],
    });
  });

  it('keeps the current row at zero when a legacy task has no transition', () => {
    const history: StatusDurationHistory = cad482('cancelled');
    expect(history.include(creation())).toBe(false);

    expect(history.summarize()).toEqual({
      observedAt: OBSERVATION,
      coverageStartedAt: OBSERVATION,
      complete: false,
      durations: [{ status: 'cancelled', durationMilliseconds: 0, active: false }],
    });
  });

  it('uses ID order at the same timestamp and includes a zero-length current span', () => {
    const history: StatusDurationHistory = cad482('review');
    expect(history.include(transition('c', 4, 'progress', 'review'))).toBe(true);
    expect(history.include(transition('b', 4, 'todo', 'progress'))).toBe(true);
    expect(history.include(creation('todo'))).toBe(true);

    expect(history.summarize().durations).toEqual([
      { status: 'todo', durationMilliseconds: 4 * HOUR, active: false },
      { status: 'progress', durationMilliseconds: 0, active: false },
      { status: 'review', durationMilliseconds: 0, active: true },
    ]);
  });

  it('does not invent time for facts later than the observation or out of order', () => {
    const future: StatusDurationHistory = cad482('progress');
    expect(future.include(transition('b', 5, 'todo', 'progress'))).toBe(false);
    expect(future.summarize().coverageStartedAt).toEqual(OBSERVATION);

    const unordered: StatusDurationHistory = cad482('progress');
    const latest = transition('b', 2, 'todo', 'progress');
    expect(unordered.include(latest)).toBe(true);
    expect(unordered.include(transition('c', 2, 'review', 'todo'))).toBe(false);
    expect(unordered.summarize().coverageStartedAt).toEqual(latest.occurredAt);
  });

  it('leaves coverage incomplete if an older fact predates a coherent creation marker', () => {
    const history: StatusDurationHistory = cad482('todo');
    expect(history.include(creation('todo'))).toBe(true);
    expect(history.include(transition('c', -1, 'progress', 'todo'))).toBe(false);

    expect(history.summarize()).toMatchObject({
      coverageStartedAt: OBSERVATION,
      complete: false,
      durations: [{ status: 'todo', durationMilliseconds: 0, active: true }],
    });
  });

  it('refuses an invalid observation instant', () => {
    expect(
      () => new StatusDurationHistory({ status: 'todo', createdAt: CREATION }, new Date(NaN)),
    ).toThrow(InvalidTaskError);
  });
});
