import { getOrganizationContext, ProblemException } from '@cadenway/nest-common';

import type { FavoriteOwner } from '../../../../application/models/collection/favorite-owner.model.js';

/** Matches UUIDs before values from the verified context are sent to PostgreSQL. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Maps the authenticated user and tenant, neither of which is provided by the request body. */
export function toFavoriteOwner(): FavoriteOwner {
  const context = getOrganizationContext();
  if (context?.actor.type !== 'user' || context.actor.id === null || !UUID.test(context.actor.id)) {
    throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
  }
  if (context.organizationId === null) {
    throw new ProblemException({ status: 403, code: 'auth.organization-required' });
  }
  return {
    organizationId: context.organizationId.toLowerCase(),
    actorUserId: context.actor.id.toLowerCase(),
  };
}
