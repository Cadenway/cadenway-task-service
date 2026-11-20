import { describe, expect, it } from 'vitest';

import { CustomFieldError } from '../../errors/custom-field/custom-field.error.js';
import type { CustomFieldDefinition } from '../../value-objects/custom-field/custom-field-definition.value-object.js';
import { SpaceCustomFields } from './space-custom-fields.aggregate.js';

const spaceId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const otherSpaceId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e02';

function fieldId(index: number): string {
  return `019a700a-1234-7567-89ab-${index.toString(16).padStart(12, '0')}`;
}

function field(
  position: number,
  properties: Partial<CustomFieldDefinition> = {},
): CustomFieldDefinition {
  return {
    id: fieldId(position),
    spaceId,
    name: `Field ${String(position)}`,
    type: 'number',
    position,
    sprintPoints: false,
    version: 1,
    ...properties,
  };
}

describe('space custom fields', () => {
  it('appends the typed definition and preserves equal display names as distinct IDs', () => {
    const first = field(0, { name: 'Client' });
    const created = new SpaceCustomFields(spaceId, [first]).append(fieldId(1), {
      name: ' Client ',
      type: 'text',
    });

    expect(created).toEqual(field(1, { name: 'Client', type: 'text' }));
  });

  it('allows creation through the thirtieth field, then refuses further definitions', () => {
    const active = Array.from({ length: 29 }, (_, position) => field(position));
    const last = new SpaceCustomFields(spaceId, active).append(fieldId(29), {
      name: 'Client',
      type: 'text',
    });
    const full = new SpaceCustomFields(spaceId, [...active, last]);

    expect(last.position).toBe(29);
    expect(() => full.append(fieldId(30), { name: 'Extra', type: 'number' })).toThrow(
      expect.objectContaining({ reason: 'limit-reached' }),
    );
  });

  it('rejects duplicate IDs and definitions from a different space', () => {
    const current = field(0);

    expect(() => new SpaceCustomFields(spaceId, [current, field(1, { id: current.id })])).toThrow(
      CustomFieldError,
    );
    expect(() => new SpaceCustomFields(spaceId, [field(0, { spaceId: otherSpaceId })])).toThrow(
      CustomFieldError,
    );
    expect(() => new SpaceCustomFields(spaceId, [current]).append(current.id, current)).toThrow(
      CustomFieldError,
    );
  });

  it.each([
    { violation: 'an order gap', active: [field(1)] },
    { violation: 'a zero version', active: [field(0, { version: 0 })] },
    { violation: 'an invalid ID', active: [field(0, { id: 'invalid' })] },
    { violation: 'an untrimmed name', active: [field(0, { name: ' Client ' })] },
    {
      violation: 'a designated text field',
      active: [field(0, { type: 'text', sprintPoints: true })],
    },
    {
      violation: 'duplicate designations',
      active: [field(0, { sprintPoints: true }), field(1, { sprintPoints: true })],
    },
  ])('refuses a stored definition set with $violation', ({ active }) => {
    expect(() => new SpaceCustomFields(spaceId, active)).toThrow(
      expect.objectContaining({ reason: 'definition-invalid' }),
    );
  });

  it('trims the name and measures the contract limit in Unicode code points', () => {
    const fields = new SpaceCustomFields(spaceId, []);
    const limit = '📌'.repeat(80);

    expect(fields.append(fieldId(0), { name: limit, type: 'text' }).name).toBe(limit);
    expect(() => fields.append(fieldId(0), { name: `${limit} `, type: 'text' })).toThrow(
      CustomFieldError,
    );
    expect(() => fields.append(fieldId(0), { name: '\n\t', type: 'text' })).toThrow(
      CustomFieldError,
    );
  });

  it('reorders definitions and increments each changed definition once', () => {
    const first = field(0, { sprintPoints: true, version: 4 });
    const second = field(1, { version: 3 });
    const unchanged = field(2);
    const fields = new SpaceCustomFields(spaceId, [unchanged, first, second]);

    const result = fields.update(
      second.id,
      { name: ' Effort ', position: 0, sprintPoints: true },
      false,
    );

    const target = { ...second, position: 0, name: 'Effort', sprintPoints: true, version: 4 };
    expect(result.definition).toEqual(target);
    expect(result.updated).toEqual([
      target,
      { ...first, position: 1, sprintPoints: false, version: 5 },
    ]);
    expect(fields.update(second.id, {}, false)).toEqual({ definition: second, updated: [] });
  });

  it('retains the version when the effective name, order and designation are unchanged', () => {
    const current = field(0, { name: 'Points', sprintPoints: true, version: 8 });

    expect(
      new SpaceCustomFields(spaceId, [current]).update(
        current.id,
        { name: ' Points ', position: 0, sprintPoints: true },
        false,
      ),
    ).toEqual({ definition: current, updated: [] });
  });

  it('refuses a text field or a numeric field with negative values as sprint points', () => {
    const designated = field(0, { sprintPoints: true });
    const text = field(1, { type: 'text' });
    const numeric = field(2);
    const fields = new SpaceCustomFields(spaceId, [designated, text, numeric]);

    expect(() => fields.update(text.id, { sprintPoints: true }, false)).toThrow(
      expect.objectContaining({ reason: 'sprint-points-invalid' }),
    );
    expect(() => fields.update(numeric.id, { sprintPoints: true }, true)).toThrow(
      expect.objectContaining({ reason: 'sprint-points-invalid' }),
    );
    expect(fields.update(designated.id, {}, false).definition).toEqual(designated);
  });

  it('refuses a missing field or an out-of-order position', () => {
    const current = field(0);
    const fields = new SpaceCustomFields(spaceId, [current]);

    expect(() => fields.update(fieldId(1), {}, false)).toThrow(
      expect.objectContaining({ reason: 'not-found' }),
    );
    expect(() => fields.update(current.id, { position: 1 }, false)).toThrow(
      expect.objectContaining({ reason: 'position-invalid' }),
    );
  });

  it('moves a field later without changing the relative order of its neighbors', () => {
    const first = field(0);
    const second = field(1, { sprintPoints: true });
    const third = field(2);
    const active = new SpaceCustomFields(spaceId, [first, second, third]);

    expect(active.update(first.id, { position: 2 }, false).updated).toEqual([
      { ...second, position: 0, version: 2 },
      { ...third, position: 1, version: 2 },
      { ...first, position: 2, version: 2 },
    ]);
  });

  it('retires the field, clears its designation and increments only shifted definitions', () => {
    const first = field(0);
    const designated = field(1, { sprintPoints: true, version: 2 });
    const last = field(2, { version: 4 });
    const fields = new SpaceCustomFields(spaceId, [first, designated, last]);

    expect(fields.retire(designated.id)).toEqual({
      retired: { ...designated, sprintPoints: false, version: 3 },
      updated: [{ ...last, position: 1, version: 5 }],
    });
    expect(() => fields.retire(fieldId(3))).toThrow(
      expect.objectContaining({ reason: 'not-found' }),
    );
  });

  it('clears the designation without shifting order or changing other definitions', () => {
    const first = field(0);
    const second = field(1, { sprintPoints: true, version: 9 });
    const fields = new SpaceCustomFields(spaceId, [first, second]);
    const result = fields.update(second.id, { sprintPoints: false }, false);

    expect(result).toEqual({
      definition: { ...second, sprintPoints: false, version: 10 },
      updated: [{ ...second, sprintPoints: false, version: 10 }],
    });
  });
});
