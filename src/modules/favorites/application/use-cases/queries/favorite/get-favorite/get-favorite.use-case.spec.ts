import { describe, expect, it } from 'vitest';

import { owner, setup, space } from '../../../favorites.fixture.js';
import { GetFavorite } from './get-favorite.use-case.js';

describe('GetFavorite', () => {
  it('returns the same missing response for an unowned favorite or an inaccessible target', async () => {
    const { favorites, unitOfWork, directory } = setup();
    favorites.find.mockResolvedValueOnce(null);
    directory.visible.mockResolvedValue(new Map());
    const useCase = new GetFavorite(unitOfWork, directory);
    const input = { ...owner, favoriteId: space.id };

    await expect(useCase.execute(input)).rejects.toMatchObject({ reason: 'favorite-not-found' });
    await expect(useCase.execute(input)).rejects.toMatchObject({ reason: 'favorite-not-found' });
    expect(favorites.find).toHaveBeenCalledWith(input, space.id);
  });
});
