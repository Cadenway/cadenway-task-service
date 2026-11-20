import { describe, expect, it } from 'vitest';

import type { VisibleFavorite } from '../../../../projections/favorite/visible-favorite.projection.js';
import { list, now, owner, product, setup, space, view } from '../../../favorites.fixture.js';
import { ListFavorites } from './list-favorites.use-case.js';

describe('ListFavorites', () => {
  it('skips hidden favorites before establishing the page boundary and returns them when restored', async () => {
    const { favorites, unitOfWork, directory } = setup();
    favorites.list.mockResolvedValue([space, list, view]);
    directory.visible.mockResolvedValueOnce(
      new Map<string, VisibleFavorite['target']>([
        ['space:a', product],
        ['saved-view:c', { name: 'New name', listId: 'list' }],
      ]),
    );
    const useCase = new ListFavorites(unitOfWork, directory);
    const input = { ...owner, after: null, limit: 1 };

    await expect(useCase.execute(input)).resolves.toEqual({
      items: [{ ...space, target: product }],
      next: { id: space.id, createdAt: now },
    });
    expect(favorites.list).toHaveBeenCalledWith(input, null);
    expect(directory.visible).toHaveBeenCalledWith(input, 'guest', [space, list, view]);

    favorites.list.mockResolvedValueOnce([list, view]);
    directory.visible.mockResolvedValueOnce(new Map([['list:a', { name: 'Restored' }]]));
    await expect(useCase.execute({ ...input, after: space })).resolves.toEqual({
      items: [{ ...list, target: { name: 'Restored' } }],
      next: null,
    });
  });
});
