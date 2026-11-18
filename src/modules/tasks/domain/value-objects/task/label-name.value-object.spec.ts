import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { labelKey, normalizeLabelName } from './label-name.value-object.js';

describe('normalizeLabelName: a label is trimmed and has 1 to 32 characters', () => {
  it('trims the label and keeps its spelling', () => {
    expect(normalizeLabelName('  Auth ')).toBe('Auth');
  });

  it('accepts 32 characters and refuses 33, counted in code points', () => {
    expect(normalizeLabelName('é'.repeat(32))).toHaveLength(32);
    expect(() => normalizeLabelName('a'.repeat(33))).toThrow(InvalidTaskError);
    expect(normalizeLabelName('🔒'.repeat(32))).toBe('🔒'.repeat(32));
  });

  it('refuses an empty label or one made only of spaces', () => {
    expect(() => normalizeLabelName('')).toThrow(InvalidTaskError);
    expect(() => normalizeLabelName('   ')).toThrow(InvalidTaskError);
  });
});

describe('labelKey: two labels that differ only by case are one label', () => {
  it('folds case', () => {
    expect(labelKey('AUTH')).toBe(labelKey('auth'));
    expect(labelKey(' Front ')).toBe('front');
  });

  it('folds the composed and decomposed forms of an accent', () => {
    expect(labelKey('Sécurité')).toBe(labelKey('Sécurité'));
    expect(labelKey('SÉCURITÉ')).toBe(labelKey('sécurité'));
  });

  it('keeps accents significant', () => {
    expect(labelKey('Sécurité')).not.toBe(labelKey('Securite'));
  });
});
