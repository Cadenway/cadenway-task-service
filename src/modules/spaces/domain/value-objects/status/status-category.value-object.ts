import type { StatusKey } from './status-key.value-object.js';

/**
 * Type StatusCategory
 *
 * @description
 * Category of a status, as `StatusCategory` of `openapi/internal/task-service.yaml` names it:
 * `open` ("Non commencé"), `active` ("Actif") or `closed` ("Fermé").
 *
 * @type {'open' | 'active' | 'closed'}
 */
export type StatusCategory = 'open' | 'active' | 'closed';

/**
 * Constant STATUS_CATEGORY_BY_KEY
 *
 * @description
 * Category of each status key, which never changes (`StatusCategory` of
 * `openapi/internal/task-service.yaml`, `STATUS_CATEGORY_BY_KEY` of `@cadenway/contracts`): a space
 * renames or hides a status, never moves it to another category.
 *
 * @type {Readonly<Record<StatusKey, StatusCategory>>}
 */
export const STATUS_CATEGORY_BY_KEY: Readonly<Record<StatusKey, StatusCategory>> = Object.freeze({
  triage: 'open',
  backlog: 'open',
  todo: 'open',
  progress: 'active',
  review: 'active',
  testing: 'active',
  waiting: 'active',
  blocked: 'active',
  done: 'closed',
  cancelled: 'closed',
});
