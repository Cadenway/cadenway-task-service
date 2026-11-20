import { describe, expect, it } from 'vitest';

import type { CustomFieldDefinition } from '../../value-objects/custom-field/custom-field-definition.value-object.js';
import { planCustomFieldValueChanges } from './custom-field-values.policy.js';

const spaceId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const otherSpaceId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e02';
const pointsId = '019a700a-1234-7567-89ab-cdef01234567';
const textId = '019a700a-1234-7567-89ab-cdef01234568';
const numberId = '019a700a-1234-7567-89ab-cdef01234569';
const otherId = '019a700a-1234-7567-89ab-cdef0123456a';
const unknownId = '019a700a-1234-7567-89ab-cdef0123456b';
const fields: readonly CustomFieldDefinition[] = [
  {
    id: pointsId,
    name: 'Points',
    spaceId,
    type: 'number',
    position: 0,
    sprintPoints: true,
    version: 2,
  },
  {
    id: textId,
    name: 'Client',
    spaceId,
    type: 'text',
    position: 1,
    sprintPoints: false,
    version: 1,
  },
  {
    id: numberId,
    name: 'Budget',
    spaceId,
    type: 'number',
    position: 2,
    sprintPoints: false,
    version: 1,
  },
  {
    id: otherId,
    name: 'Hours',
    spaceId: otherSpaceId,
    type: 'number',
    position: 0,
    sprintPoints: false,
    version: 1,
  },
];

describe('task custom field value changes', () => {
  it('preserves numeric zero and empty text, and allows negative numbers outside sprint points', () => {
    expect(
      planCustomFieldValueChanges(
        spaceId,
        fields,
        {},
        {
          [pointsId]: 0,
          [textId]: '',
          [numberId]: -4.5,
        },
      ),
    ).toEqual([
      { fieldId: pointsId, value: 0 },
      { fieldId: textId, value: '' },
      { fieldId: numberId, value: -4.5 },
    ]);
  });

  it('clears a present value and leaves omitted fields untouched', () => {
    const stored = { [pointsId]: 5, [textId]: '   ', [numberId]: 0 };

    expect(planCustomFieldValueChanges(spaceId, fields, stored, { [textId]: null })).toEqual([
      { fieldId: textId, value: null },
    ]);
    expect(stored).toEqual({ [pointsId]: 5, [textId]: '   ', [numberId]: 0 });
  });

  it('returns no writes for equal values, a cleared absent value and an empty patch', () => {
    const stored = { [pointsId]: 0, [textId]: '' };

    expect(
      planCustomFieldValueChanges(spaceId, fields, stored, {
        [pointsId]: -0,
        [textId]: '',
        [numberId]: null,
      }),
    ).toEqual([]);
    expect(planCustomFieldValueChanges(spaceId, fields, stored, {})).toEqual([]);
  });

  it.each([
    [unknownId, null],
    [otherId, null],
    [pointsId, 'zero'],
    [pointsId, -1],
    [textId, 1],
    [numberId, Number.NaN],
    [numberId, Number.POSITIVE_INFINITY],
    [textId, '📌'.repeat(501)],
  ] as const)('refuses an unavailable field or invalid value for %s', (fieldId, value) => {
    expect(() => planCustomFieldValueChanges(spaceId, fields, {}, { [fieldId]: value })).toThrow(
      expect.objectContaining({ reason: 'value-invalid' }),
    );
  });

  it('measures text in Unicode code points and preserves whitespace', () => {
    const value = ` ${'📌'.repeat(498)} `;

    expect(planCustomFieldValueChanges(spaceId, fields, {}, { [textId]: value })).toEqual([
      { fieldId: textId, value },
    ]);
  });

  it('refuses a value patch that exceeds the maximum number of definitions', () => {
    const patch = Object.fromEntries(Array.from({ length: 31 }, (_, n) => [String(n), null]));

    expect(() => planCustomFieldValueChanges(spaceId, fields, {}, patch)).toThrow(
      expect.objectContaining({ reason: 'value-invalid' }),
    );
  });
});
