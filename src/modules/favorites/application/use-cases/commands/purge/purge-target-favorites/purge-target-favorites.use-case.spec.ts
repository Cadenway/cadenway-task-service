import { describe, expect, it } from 'vitest';

import { owner, setup, view } from '../../../favorites.fixture.js';
import { PurgeTargetFavorites } from './purge-target-favorites.use-case.js';

describe('PurgeTargetFavorites', () => {
  it('purges only the removed target kind and tenant', async () => {
    const { favorites, unitOfWork } = setup();
    const cleanup = new PurgeTargetFavorites(unitOfWork);

    await cleanup.execute({
      organizationId: owner.organizationId,
      kind: 'saved-view',
      targetIds: [],
    });
    expect(favorites.purgeTargets).not.toHaveBeenCalled();

    await cleanup.execute({
      organizationId: owner.organizationId,
      kind: 'saved-view',
      targetIds: [view.targetId],
    });
    expect(favorites.purgeTargets).toHaveBeenCalledWith(owner.organizationId, 'saved-view', [
      view.targetId,
    ]);
  });
});
