import { describe, expect, it } from 'vitest';

import { FAVORITE_LIMIT } from '../../../../../domain/policies/favorite/favorite-limit.policy.js';
import { owner, product, setup, space } from '../../../favorites.fixture.js';
import { CreateFavorite } from './create-favorite.use-case.js';

describe('CreateFavorite', () => {
  it('holds the active target and serializes capacity before storing a guest favorite', async () => {
    const { favorites, unitOfWork, directory } = setup();
    const input = { ...owner, kind: 'space', targetId: space.targetId } as const;

    await expect(new CreateFavorite(unitOfWork, directory).execute(input)).resolves.toEqual({
      ...space,
      target: product,
    });

    expect(directory.member).toHaveBeenCalledWith(input, true);
    expect(directory.hold).toHaveBeenCalledWith(input, 'guest', input);
    expect(favorites.lockOwner).toHaveBeenCalledBefore(directory.member);
    expect(directory.member).toHaveBeenCalledBefore(directory.hold);
    expect(favorites.lockOwner).toHaveBeenCalledBefore(favorites.has);
    expect(favorites.lockOwner).toHaveBeenCalledBefore(favorites.count);
    expect(directory.hold).toHaveBeenCalledBefore(favorites.has);
    expect(favorites.count).toHaveBeenCalledBefore(favorites.insert);
  });

  it('refuses an inactive target before checking private collection contents', async () => {
    const { favorites, unitOfWork, directory } = setup();
    directory.hold.mockResolvedValue(null);

    await expect(
      new CreateFavorite(unitOfWork, directory).execute({
        ...owner,
        kind: 'space',
        targetId: space.targetId,
      }),
    ).rejects.toMatchObject({ reason: 'target-not-found' });
    expect(favorites.has).not.toHaveBeenCalled();
    expect(favorites.count).not.toHaveBeenCalled();
  });

  it('reports a duplicate before capacity and counts hidden rows against the limit', async () => {
    const { favorites, unitOfWork, directory } = setup();
    favorites.has.mockResolvedValueOnce(true);
    favorites.count.mockResolvedValue(FAVORITE_LIMIT);
    const useCase = new CreateFavorite(unitOfWork, directory);
    const input = { ...owner, kind: 'space', targetId: space.targetId } as const;

    await expect(useCase.execute(input)).rejects.toMatchObject({ reason: 'already-exists' });
    await expect(useCase.execute(input)).rejects.toMatchObject({ reason: 'limit-reached' });
    expect(favorites.count).toHaveBeenCalledTimes(1);
    expect(favorites.insert).not.toHaveBeenCalled();
  });
});
