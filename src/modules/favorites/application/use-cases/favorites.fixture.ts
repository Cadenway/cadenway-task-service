import { vi } from 'vitest';
import type { Mock } from 'vitest';

import type { Favorite } from '../../domain/aggregates/favorite/favorite.entity.js';
import type { FavoriteRepository } from '../ports/outbound/persistence/favorite/favorite-repository.port.js';
import type { FavoritesUnitOfWork } from '../ports/outbound/persistence/favorite/favorites-unit-of-work.port.js';
import type { FavoriteDirectory } from '../ports/outbound/targets/favorite/favorite-directory.port.js';

export const owner = {
  organizationId: '019a7200-0000-7000-8000-000000000001',
  actorUserId: '019a7200-0000-7000-8000-000000000002',
};
export const product = { name: 'Product' };
export const now = new Date('2026-11-20T06:10:02.321Z');
export const space: Favorite = {
  id: 'a',
  kind: 'space',
  targetId: 'a',
  createdAt: now,
  version: 1,
};
export const list: Favorite = { id: 'b', kind: 'list', targetId: 'a', createdAt: now, version: 1 };
export const view: Favorite = {
  id: 'c',
  kind: 'saved-view',
  targetId: 'c',
  createdAt: now,
  version: 1,
};

type PortMocks<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? Mock<T[K]> : never;
};

/** Supplies independent owner storage and visibility checks. */
export function setup(): {
  favorites: PortMocks<FavoriteRepository>;
  unitOfWork: FavoritesUnitOfWork;
  directory: PortMocks<FavoriteDirectory>;
} {
  const favorites = {
    lockOwner: vi.fn<FavoriteRepository['lockOwner']>().mockResolvedValue(undefined),
    find: vi.fn<FavoriteRepository['find']>().mockResolvedValue(space),
    list: vi.fn<FavoriteRepository['list']>().mockResolvedValue([space]),
    has: vi.fn<FavoriteRepository['has']>().mockResolvedValue(false),
    count: vi.fn<FavoriteRepository['count']>().mockResolvedValue(0),
    insert: vi.fn<FavoriteRepository['insert']>().mockResolvedValue(space),
    delete: vi.fn<FavoriteRepository['delete']>().mockResolvedValue(true),
    purgeTargets: vi.fn<FavoriteRepository['purgeTargets']>().mockResolvedValue(undefined),
    purgeOwner: vi.fn<FavoriteRepository['purgeOwner']>().mockResolvedValue(undefined),
  };
  const unitOfWork: FavoritesUnitOfWork = {
    read: (work) => work(favorites),
    write: (work) => work(favorites),
  };
  const directory = {
    member: vi.fn<FavoriteDirectory['member']>().mockResolvedValue('guest'),
    visible: vi
      .fn<FavoriteDirectory['visible']>()
      .mockResolvedValue(new Map([['space:a', product]])),
    hold: vi.fn<FavoriteDirectory['hold']>().mockResolvedValue(product),
  };
  return { favorites, unitOfWork, directory };
}
