import { describe, expect, it } from 'vitest';

import type { UpdateSpaceBody } from '../../dto/input/space/update-space-body.dto.js';
import { toSpacePatch } from './space-patch.mapper.js';

describe('toSpacePatch', () => {
  it('maps an empty patch to an empty patch', () => {
    expect(toSpacePatch({})).toEqual({});
  });

  it('keeps a member left out absent and a member sent as null', () => {
    const patch: ReturnType<typeof toSpacePatch> = toSpacePatch({ description: null, icon: null });

    expect(patch).toStrictEqual({ description: null, icon: null });
    expect('name' in patch).toBe(false);
    expect('statuses' in patch).toBe(false);
  });

  it('keeps the members a status change names, and null for a whole status or all of them', () => {
    const body: UpdateSpaceBody = {
      statuses: {
        review: { name: 'Relecture' },
        blocked: { name: null },
        todo: { hidden: false },
        waiting: null,
        done: {},
        triage: undefined,
      },
    };

    expect(toSpacePatch(body)).toStrictEqual({
      statuses: {
        review: { name: 'Relecture' },
        blocked: { name: null },
        todo: { hidden: false },
        waiting: null,
        done: {},
      },
    });
    expect(toSpacePatch({ statuses: null })).toStrictEqual({ statuses: null });
  });

  it('maps every member of a complete patch', () => {
    expect(
      toSpacePatch({
        name: 'Ressources humaines',
        prefix: 'RH',
        description: 'Équipe',
        icon: 'users',
        color: 'vert',
        visibility: 'private',
      }),
    ).toStrictEqual({
      name: 'Ressources humaines',
      prefix: 'RH',
      description: 'Équipe',
      icon: 'users',
      color: 'vert',
      visibility: 'private',
    });
  });
});
