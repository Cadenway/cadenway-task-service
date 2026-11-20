import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { normalizeTimeEntry } from './time-entry-details.value-object.js';

describe('normalizeTimeEntry', () => {
  it('keeps the work date and trims the note', () => {
    expect(
      normalizeTimeEntry({ minutes: 150, workDate: '2026-11-07', note: '  Maquette  ' }),
    ).toEqual({ minutes: 150, workDate: '2026-11-07', note: 'Maquette' });
  });

  it('accepts the input limits and stores an absent or blank note as null', () => {
    expect(normalizeTimeEntry({ minutes: 1, workDate: '0001-01-01' }).note).toBeNull();
    expect(
      normalizeTimeEntry({ minutes: 1440, workDate: '9999-12-31', note: ' \t\n' }).note,
    ).toBeNull();
  });

  it.each([0, 1441, 1.5, NaN, Infinity])('refuses invalid minutes %s', (minutes: number) => {
    expect(() => normalizeTimeEntry({ minutes, workDate: '2026-11-07' })).toThrow(InvalidTaskError);
  });

  it.each(['0000-01-01', '2026-02-29', '2026-11-7', '2026-11-07T00:00:00Z'])(
    'refuses an invalid work date %s',
    (workDate: string) => {
      expect(() => normalizeTimeEntry({ minutes: 150, workDate })).toThrow(InvalidTaskError);
    },
  );

  it('limits the submitted note by Unicode code points before trimming', () => {
    const note: string = '\u{1f642}'.repeat(500);
    expect(normalizeTimeEntry({ minutes: 150, workDate: '2026-11-07', note }).note).toBe(note);
    expect(() =>
      normalizeTimeEntry({ minutes: 150, workDate: '2026-11-07', note: `${note} ` }),
    ).toThrow(InvalidTaskError);
  });
});
