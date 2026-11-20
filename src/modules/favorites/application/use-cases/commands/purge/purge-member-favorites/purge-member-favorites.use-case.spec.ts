import { describe, expect, it } from 'vitest';

import { owner, setup, space } from '../../../favorites.fixture.js';
import { CreateFavorite } from '../../favorite/create-favorite/create-favorite.use-case.js';
import { PurgeMemberFavorites } from './purge-member-favorites.use-case.js';

/** Pauses a mocked transaction operation until the test releases it. */
function gate() {
  let open: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { pending, open };
}

describe('PurgeMemberFavorites', () => {
  it('cleans up the removed account without deleting a later membership collection', async () => {
    const { favorites, unitOfWork, directory } = setup();
    const input = { organizationId: owner.organizationId, userId: owner.actorUserId };
    const cleanup = new PurgeMemberFavorites(unitOfWork, directory);

    await cleanup.execute(input);
    expect(favorites.purgeOwner).not.toHaveBeenCalled();
    expect(favorites.lockOwner).toHaveBeenCalledWith(owner);
    expect(favorites.lockOwner).toHaveBeenCalledBefore(directory.member);

    directory.member.mockResolvedValue(null);
    await cleanup.execute(input);
    expect(directory.member).toHaveBeenLastCalledWith(owner, true);
    expect(favorites.purgeOwner).toHaveBeenCalledWith(owner);
  });

  it('reads a rejoined membership after waiting for the owner lock', async () => {
    const { favorites, unitOfWork, directory } = setup();
    const ownerLock = gate();
    favorites.lockOwner.mockReturnValueOnce(ownerLock.pending);
    directory.member.mockResolvedValue(null);
    const cleanup = new PurgeMemberFavorites(unitOfWork, directory).execute({
      organizationId: owner.organizationId,
      userId: owner.actorUserId,
    });
    expect(directory.member).not.toHaveBeenCalled();

    directory.member.mockResolvedValue('member');
    ownerLock.open();
    await cleanup;
    expect(favorites.purgeOwner).not.toHaveBeenCalled();
  });

  it('lets a rejoined member add favorites after an earlier removal cleanup releases the lock', async () => {
    const { favorites, unitOfWork, directory } = setup();
    const creationLock = gate();
    const purgeStarted = gate();
    const purgeCompletes = gate();
    favorites.lockOwner.mockResolvedValueOnce(undefined).mockReturnValueOnce(creationLock.pending);
    directory.member.mockResolvedValueOnce(null).mockResolvedValue('member');
    favorites.purgeOwner.mockImplementationOnce(async () => {
      purgeStarted.open();
      await purgeCompletes.pending;
    });

    const cleanup = new PurgeMemberFavorites(unitOfWork, directory).execute({
      organizationId: owner.organizationId,
      userId: owner.actorUserId,
    });
    await purgeStarted.pending;
    const creation = new CreateFavorite(unitOfWork, directory).execute({
      ...owner,
      kind: 'space',
      targetId: space.targetId,
    });
    expect(directory.member).toHaveBeenCalledOnce();
    expect(favorites.insert).not.toHaveBeenCalled();

    purgeCompletes.open();
    await cleanup;
    creationLock.open();
    await expect(creation).resolves.toMatchObject({ id: space.id });
    expect(favorites.purgeOwner).toHaveBeenCalledBefore(favorites.insert);
  });
});
