import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { spaces } from '../../schemas/space/space.schema.js';

/**
 * Function visibleSpaceCondition
 *
 * @description
 * The condition that keeps the spaces a viewer sees: those of the whole organization and the
 * private ones the viewer owns, except those awaiting an owner
 * (`(visibility = 'organization' OR owner_user_id = $viewer) AND NOT awaiting_owner`, the rule of
 * `canSeeSpace` for a member that is no guest). Every query that lists spaces, or lists through
 * their space, applies this one condition. It is parenthesized as a whole, so it stays one term
 * under `not` or `or`. It does not name `organization_id`: the caller does.
 *
 * @param {string} viewerUserId - The account of the member.
 * @returns {SQL} The condition, over the columns of `spaces`.
 */
export function visibleSpaceCondition(viewerUserId: string): SQL {
  return sql`((${spaces.visibility} = 'organization' or ${spaces.ownerUserId} = ${viewerUserId}) and not ${spaces.awaitingOwner})`;
}
