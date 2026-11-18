import { STATUS_CATEGORY_BY_KEY } from '@cadenway/contracts';
import type { StatusKey } from '@cadenway/contracts';
import type { Space, SpaceStatus } from '@cadenway/contracts/types/internal/task-service';

import type { PlacedSpace } from '../../../../application/models/placement/placed-space.model.js';

/**
 * Function toStatus
 *
 * @description
 * Gives a stored status its category, which follows from its key and never changes
 * (`STATUS_CATEGORY_BY_KEY` of `@cadenway/contracts`).
 *
 * @param {StatusKey} key - The key of the status.
 * @param {PlacedSpace['statuses'][StatusKey]} status - The name and the visibility the space stores.
 * @returns {SpaceStatus} The status as the contract carries it.
 */
function toStatus(key: StatusKey, status: PlacedSpace['statuses'][StatusKey]): SpaceStatus {
  return { category: STATUS_CATEGORY_BY_KEY[key], name: status.name, hidden: status.hidden };
}

/**
 * Function toPlacedSpace
 *
 * @description
 * Maps the space of a task, as the spaces module showed it to the viewer, to the `Space` of
 * `openapi/internal/task-service.yaml`: the owner as `{ userId }`, the ten statuses with their
 * category and the creation instant in ISO 8601. The organization of the space is not part of the
 * contract and does not leave the service.
 *
 * @param {PlacedSpace} space - The space and its next key.
 * @returns {Space} The space of the contract.
 */
export function toPlacedSpace(space: PlacedSpace): Space {
  return {
    id: space.id,
    name: space.name,
    prefix: space.prefix,
    description: space.description,
    icon: space.icon,
    color: space.color,
    visibility: space.visibility,
    owner: { userId: space.ownerUserId },
    statuses: {
      triage: toStatus('triage', space.statuses.triage),
      backlog: toStatus('backlog', space.statuses.backlog),
      todo: toStatus('todo', space.statuses.todo),
      progress: toStatus('progress', space.statuses.progress),
      review: toStatus('review', space.statuses.review),
      testing: toStatus('testing', space.statuses.testing),
      waiting: toStatus('waiting', space.statuses.waiting),
      blocked: toStatus('blocked', space.statuses.blocked),
      done: toStatus('done', space.statuses.done),
      cancelled: toStatus('cancelled', space.statuses.cancelled),
    },
    nextKey: space.nextKey,
    createdAt: space.createdAt.toISOString(),
    version: space.version,
  };
}
