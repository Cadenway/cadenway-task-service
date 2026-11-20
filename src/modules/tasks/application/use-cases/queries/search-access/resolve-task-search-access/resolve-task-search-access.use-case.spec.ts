import { describe, expect, it, vi } from 'vitest';

import type { SearchAccessMembership } from '../../../../models/search-access/search-access-membership.model.js';
import type { SearchAccessPlacement } from '../../../../models/search-access/search-access-placement.model.js';
import type { SearchAccessStore } from '../../../../models/search-access/search-access-store.model.js';
import type { ResolveTaskSearchAccessInput } from './resolve-task-search-access.input.js';
import { ResolveTaskSearchAccess } from './resolve-task-search-access.use-case.js';

const caller = { organizationId: 'organization', actorUserId: 'user' };
const membership = { memberId: 'member', version: 3, role: 'guest' } as const;
const viewer = { ...caller, role: membership.role };
const task = {
  kind: 'task',
  id: 'CAD-174',
  version: 12,
  listId: 'shared',
  spaceId: 'indirect',
} as const;
const hidden = { ...task, id: 'CAD-175', listId: 'hidden' };
const list = { kind: 'list', id: 'shared', version: 4, spaceId: 'indirect' } as const;
const indirect = { kind: 'space', id: 'indirect', version: 6 } as const;
const direct = { kind: 'space', id: 'direct', version: 7 } as const;
const privateSpace = { kind: 'space', id: 'private', version: 8 } as const;
const active: Record<SearchAccessPlacement['kind'], readonly SearchAccessPlacement[]> = {
  task: [task, hidden],
  list: [list],
  space: [indirect, direct, privateSpace],
};

function wire(member: SearchAccessMembership | null = membership) {
  const store = {
    membership: vi.fn<SearchAccessStore['membership']>().mockResolvedValue(member),
    placements: vi
      .fn<SearchAccessStore['placements']>()
      .mockImplementation((_organizationId, kind, ids) =>
        Promise.resolve(active[kind].filter(({ id }) => ids.includes(id))),
      ),
    visibleLists: vi.fn<SearchAccessStore['visibleLists']>().mockResolvedValue([list.id]),
    visibleSpaces: vi
      .fn<SearchAccessStore['visibleSpaces']>()
      .mockResolvedValue([indirect.id, direct.id]),
    directSpaces: vi.fn<SearchAccessStore['directSpaces']>().mockResolvedValue([direct.id]),
  };
  return { store, useCase: new ResolveTaskSearchAccess({ read: (work) => work(store) }) };
}

describe('ResolveTaskSearchAccess', () => {
  it('returns authorized active candidates in request order and distinguishes indirect access', async () => {
    const { store, useCase } = wire();
    const candidates: ResolveTaskSearchAccessInput['candidates'] = [
      indirect,
      hidden,
      list,
      direct,
      { kind: 'task', id: 'CAD-176' },
      task,
      privateSpace,
    ];

    await expect(useCase.execute({ ...caller, membership, candidates })).resolves.toEqual({
      results: [{ ...indirect, directSpace: false }, list, { ...direct, directSpace: true }, task],
    });
    expect(store.membership).toHaveBeenCalledExactlyOnceWith(caller);
    expect(store.placements).toHaveBeenCalledTimes(3);
    expect(store.visibleLists).toHaveBeenCalledExactlyOnceWith(viewer, ['shared', 'hidden']);
    expect(store.visibleSpaces).toHaveBeenCalledExactlyOnceWith(viewer, [
      'indirect',
      'direct',
      'private',
    ]);
    expect(store.directSpaces).toHaveBeenCalledExactlyOnceWith(viewer, ['indirect', 'direct']);
  });

  it.each([
    null,
    { ...membership, memberId: 'replacement' },
    { ...membership, version: 4 },
    { ...membership, role: 'member' },
  ] satisfies (SearchAccessMembership | null)[])(
    'denies mismatching membership evidence %j',
    async (local) => {
      const { store, useCase } = wire(local);

      await expect(
        useCase.execute({ ...caller, membership, candidates: [task] }),
      ).resolves.toBeNull();
      expect(store.placements).not.toHaveBeenCalled();
      expect(store.visibleLists).not.toHaveBeenCalled();
    },
  );

  it('requires a current matching membership even for an empty batch', async () => {
    const { store, useCase } = wire();
    const input = { ...caller, membership, candidates: [] };

    await expect(useCase.execute(input)).resolves.toEqual({ results: [] });
    expect(store.membership).toHaveBeenCalledExactlyOnceWith(caller);
    expect(store.placements).not.toHaveBeenCalled();
    store.membership.mockResolvedValue(null);
    await expect(useCase.execute(input)).resolves.toBeNull();
  });
});
