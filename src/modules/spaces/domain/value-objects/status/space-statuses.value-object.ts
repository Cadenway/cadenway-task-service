import type { SpaceStatus } from './space-status.value-object.js';
import type { StatusKey } from './status-key.value-object.js';

/**
 * Type SpaceStatuses
 *
 * @description
 * The ten statuses as a space shows them, by key (`SpaceStatuses` of
 * `openapi/internal/task-service.yaml`): every key is always present.
 *
 * @type {Readonly<Record<StatusKey, SpaceStatus>>}
 */
export type SpaceStatuses = Readonly<Record<StatusKey, SpaceStatus>>;

/**
 * Constant DEFAULT_SPACE_STATUSES
 *
 * @description
 * The statuses of a new space, and those "Rétablir par défaut" puts back (`SpaceStatusesPatch` of
 * `openapi/internal/task-service.yaml`): every status under its default label, none hidden.
 *
 * @type {SpaceStatuses}
 */
export const DEFAULT_SPACE_STATUSES: SpaceStatuses = Object.freeze({
  triage: Object.freeze({ name: null, hidden: false }),
  backlog: Object.freeze({ name: null, hidden: false }),
  todo: Object.freeze({ name: null, hidden: false }),
  progress: Object.freeze({ name: null, hidden: false }),
  review: Object.freeze({ name: null, hidden: false }),
  testing: Object.freeze({ name: null, hidden: false }),
  waiting: Object.freeze({ name: null, hidden: false }),
  blocked: Object.freeze({ name: null, hidden: false }),
  done: Object.freeze({ name: null, hidden: false }),
  cancelled: Object.freeze({ name: null, hidden: false }),
});
