import { describe, expect, it } from 'vitest';

import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import {
  ATELIER_NORD,
  DESIGN,
  InMemorySpaces,
  LEA,
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  backlogState,
  designState,
  listGrantOf,
  spaceGrantOf,
  spaceState,
} from '../../../spaces.fixture.js';
import { ResolveGoalSpaces } from './resolve-goal-spaces.use-case.js';

describe('ResolveGoalSpaces', () => {
  it('returns effective space roles in the tenant and ignores duplicates and list-only grants', async () => {
    const list = backlogState();
    const spaces = new InMemorySpaces({
      spaces: [spaceState(), designState()],
      lists: [list],
      grants: [spaceGrantOf(DESIGN, LEA, 'comment'), listGrantOf(PRODUIT, list.id, NADIA, 'view')],
    });
    const input = {
      organizationId: ATELIER_NORD,
      viewerUserId: LEA,
      viewerRole: 'member',
      spaceIds: [DESIGN, DESIGN],
    } as const;
    const operation = new ResolveGoalSpaces(spaces);
    await expect(operation.execute(input)).resolves.toEqual([{ id: DESIGN, role: 'comment' }]);
    await expect(
      operation.execute({ ...input, organizationId: OTHER_ORGANIZATION }),
    ).resolves.toEqual([]);
    await expect(
      operation.execute({
        ...input,
        viewerUserId: NADIA,
        viewerRole: 'guest',
        spaceIds: [PRODUIT],
      }),
    ).resolves.toEqual([]);
    await expect(operation.execute({ ...input, spaceIds: [] })).resolves.toEqual([]);
  });

  it('rechecks the batched grants after locking a space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [designState()],
      grants: [spaceGrantOf(DESIGN, LEA, 'comment')],
    });
    const revoked: SpacesUnitOfWork = {
      run: (work) =>
        spaces.run((store) => {
          let reads = 0;
          return work({
            ...store,
            spaces: {
              ...store.spaces,
              findVisibleByIds: async (...args) => {
                const rows = await store.spaces.findVisibleByIds(...args);
                reads += 1;
                return reads === 1 ? rows : [];
              },
            },
          });
        }),
    };
    await expect(
      new ResolveGoalSpaces(revoked).execute({
        organizationId: ATELIER_NORD,
        viewerUserId: LEA,
        viewerRole: 'member',
        spaceIds: [DESIGN],
        lock: true,
      }),
    ).resolves.toEqual([]);
    expect(spaces.journal).toEqual([`space ${DESIGN}`]);
  });
});
