import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  DESIGN,
  HUGO,
  INES,
  InMemorySpaces,
  LEA,
  designState,
  spaceGrantOf,
} from '../../../spaces.fixture.js';
import { ResolveCustomFieldSpace } from './resolve-custom-field-space.use-case.js';

describe('ResolveCustomFieldSpace', () => {
  it('holds the space and distinguishes a manager from an editor', async () => {
    const store = new InMemorySpaces({
      spaces: [designState()],
      grants: [spaceGrantOf(DESIGN, INES, 'edit')],
    });
    const query = new ResolveCustomFieldSpace(store);
    const input = {
      organizationId: ATELIER_NORD,
      spaceId: DESIGN,
      viewerRole: 'member' as const,
      lock: true,
    };
    await expect(query.execute({ ...input, viewerUserId: INES })).resolves.toEqual({
      role: 'edit',
      canManage: false,
    });
    await expect(query.execute({ ...input, viewerUserId: HUGO })).resolves.toEqual({
      role: 'edit',
      canManage: true,
    });
    expect(store.journal).toEqual([`space ${DESIGN}`, `space ${DESIGN}`]);
  });

  it('hides a space from a member without a space role', async () => {
    const store = new InMemorySpaces({ spaces: [designState()] });
    const query = new ResolveCustomFieldSpace(store);
    await expect(
      query.execute({
        organizationId: ATELIER_NORD,
        spaceId: DESIGN,
        viewerUserId: LEA,
        viewerRole: 'member',
        lock: false,
      }),
    ).resolves.toBeNull();
    expect(store.journal).toEqual([]);
  });
});
