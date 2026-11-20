import type { Favorite, FavoriteTarget } from '@cadenway/contracts/types/internal/task-service';

import type { VisibleFavorite } from '../../../../application/projections/favorite/visible-favorite.projection.js';

/** Builds the currently visible target's public route and display data. */
function toTarget(favorite: VisibleFavorite): FavoriteTarget {
  const { kind, targetId, target } = favorite;
  switch (kind) {
    case 'space':
      return { name: target.name, href: `/v1/spaces/${targetId}` };
    case 'list':
      return { name: target.name, href: `/v1/lists/${targetId}` };
    case 'saved-view': {
      if (target.listId === undefined) {
        throw new Error('A saved-view favorite must carry its visible parent list');
      }
      return {
        name: target.name,
        href: `/v1/lists/${target.listId}/saved-views/${targetId}`,
        listId: target.listId,
      };
    }
  }
}

/** Maps the visible projection to the published response and supplies the ETag version. */
export function toFavorite(favorite: VisibleFavorite): Favorite {
  return {
    id: favorite.id,
    kind: favorite.kind,
    targetId: favorite.targetId,
    target: toTarget(favorite),
    createdAt: favorite.createdAt.toISOString(),
    version: favorite.version,
  };
}
