import { describe, expect, it } from 'vitest';

import { CreateListBody } from '../../dto/input/list/create-list-body.dto.js';
import { UpdateListBody } from '../../dto/input/list/update-list-body.dto.js';
import { CreateSpaceBody } from '../../dto/input/space/create-space-body.dto.js';
import { UpdateSpaceBody } from '../../dto/input/space/update-space-body.dto.js';

describe('the bodies of the spaces and the lists', () => {
  it('applies the defaults of the contract to a new space', () => {
    expect(CreateSpaceBody.schema.parse({ name: 'Ressources humaines', prefix: 'RH' })).toEqual({
      name: 'Ressources humaines',
      prefix: 'RH',
      icon: null,
      color: 'gris',
      visibility: 'organization',
    });
  });

  it('applies the defaults of the contract to a new list and drops undeclared members', () => {
    expect(CreateListBody.schema.parse({ name: 'Sprint 15', spaceId: 'ignored' })).toEqual({
      name: 'Sprint 15',
      icon: null,
      color: 'gris',
    });
  });

  it('refuses a name made only of spaces, on the member and without quoting it', () => {
    const results = [
      CreateSpaceBody.schema.safeParse({ name: '   ', prefix: 'RH' }),
      CreateListBody.schema.safeParse({ name: ' \t ' }),
      UpdateSpaceBody.schema.safeParse({ name: '  ' }),
      UpdateListBody.schema.safeParse({ name: '  ' }),
    ];

    for (const result of results) {
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.path)).toEqual([['name']]);
        expect(result.error.issues.map((issue) => issue.message)).toEqual([
          'Expected a name with a character other than a space',
        ]);
      }
    }
  });

  it('refuses a status name made only of spaces on its own path', () => {
    const result = UpdateSpaceBody.schema.safeParse({
      statuses: { review: { name: '   ' }, blocked: { name: 'Bloqué' }, done: null },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([
        ['statuses', 'review', 'name'],
      ]);
    }
  });

  it('keeps a member left out of a patch absent and a member sent as null', () => {
    expect(UpdateSpaceBody.schema.parse({})).toStrictEqual({});
    expect(UpdateSpaceBody.schema.parse({ description: null, statuses: null })).toStrictEqual({
      description: null,
      statuses: null,
    });
    expect(UpdateListBody.schema.parse({ sprint: null })).toStrictEqual({ sprint: null });
  });
});
