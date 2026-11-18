import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { TaskKey } from './task-key.value-object.js';

describe('TaskKey.parse: a key is a prefix of 2 to 5 letters, a dash and a number', () => {
  it('reads CAD-482 into its prefix and number', () => {
    const key: TaskKey = TaskKey.parse('CAD-482');

    expect(key.prefix).toBe('CAD');
    expect(key.number).toBe(482);
    expect(key.format()).toBe('CAD-482');
  });

  it.each(['AB-1', 'ABCDE-999999999', 'MKT-10'])('accepts %s', (text: string) => {
    expect(TaskKey.parse(text).format()).toBe(text);
    expect(TaskKey.isKey(text)).toBe(true);
  });

  it.each([
    ['a lower-case prefix', 'cad-482'],
    ['a zero-padded number', 'CAD-0482'],
    ['the number zero', 'CAD-0'],
    ['a prefix of one letter', 'C-482'],
    ['a prefix of six letters', 'ABCDEF-1'],
    ['a number of ten digits', 'CAD-1000000000'],
    ['an accented prefix', 'ÉQU-1'],
    ['no dash', 'CAD482'],
    ['surrounding spaces', ' CAD-482'],
  ])('refuses %s', (_case: string, text: string) => {
    expect(TaskKey.isKey(text)).toBe(false);
    expect(() => TaskKey.parse(text)).toThrow(InvalidTaskError);
  });
});

describe('TaskKey.of: the number goes from 1 to 999,999,999', () => {
  it('accepts the bounds', () => {
    expect(TaskKey.of('CAD', 1).format()).toBe('CAD-1');
    expect(TaskKey.of('CAD', 999_999_999).format()).toBe('CAD-999999999');
  });

  it.each([0, -1, 1_000_000_000, 1.5, Number.NaN])('refuses the number %s', (number: number) => {
    expect(() => TaskKey.of('CAD', number)).toThrow(InvalidTaskError);
  });

  it('refuses a prefix that is not 2 to 5 uppercase letters', () => {
    expect(() => TaskKey.of('Cad', 1)).toThrow(InvalidTaskError);
    expect(() => TaskKey.of('CAD-', 1)).toThrow(InvalidTaskError);
  });

  it('compares keys by their parts and freezes them', () => {
    const key: TaskKey = TaskKey.of('CAD', 482);

    expect(key.equals(TaskKey.parse('CAD-482'))).toBe(true);
    expect(key.equals(TaskKey.parse('CAD-483'))).toBe(false);
    expect(key.equals(TaskKey.parse('DES-482'))).toBe(false);
    expect(Object.isFrozen(key)).toBe(true);
  });
});
