import type { Grant } from '@cadenway/contracts/types/internal/task-service';

import type { StoredGrant } from '../../../../application/models/access/stored-grant.model.js';

/**
 * Function toGrant
 *
 * @description
 * Maps a stored grant to the `Grant` of `openapi/internal/task-service.yaml`: the person, the
 * role, when and by whom this role was given (ISO 8601). When the person was first given access
 * orders the listing and does not leave the service.
 *
 * @param {StoredGrant} grant - The stored grant.
 * @returns {Grant} The grant of the contract.
 */
export function toGrant(grant: StoredGrant): Grant {
  return {
    userId: grant.userId,
    role: grant.role,
    grantedAt: grant.grantedAt.toISOString(),
    grantedBy: { type: grant.grantedBy.type, id: grant.grantedBy.id },
  };
}
