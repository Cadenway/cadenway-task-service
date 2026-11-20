import { describe, expect, it } from 'vitest';

import { owner, setup, space } from '../../../favorites.fixture.js';
import { DeleteFavorite } from './delete-favorite.use-case.js';

describe('DeleteFavorite', () => {
  it('checks visibility before evaluating a stale ETag and deletes only with a matching ETag', async () => {
    const { favorites, unitOfWork, directory } = setup();
    directory.hold.mockResolvedValueOnce(null);
    const useCase = new DeleteFavorite(unitOfWork, directory);
    const input = { ...owner, favoriteId: space.id, expectedVersions: [2] };

    await expect(useCase.execute(input)).rejects.toMatchObject({ reason: 'favorite-not-found' });
    await expect(useCase.execute(input)).rejects.toMatchObject({
      reason: 'version-mismatch',
      version: 1,
    });
    expect(favorites.delete).not.toHaveBeenCalled();
    await expect(useCase.execute({ ...input, expectedVersions: [1] })).resolves.toBeUndefined();
    expect(favorites.delete).toHaveBeenCalledOnce();
  });
});
