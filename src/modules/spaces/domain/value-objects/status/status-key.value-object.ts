/**
 * Type StatusKey
 *
 * @description
 * Key of a task status, as `StatusKey` of `openapi/internal/task-service.yaml` names it: `triage`
 * ("À trier"), `backlog` ("À planifier"), `todo` ("À faire"), `progress` ("En cours"), `review`
 * ("En revue"), `testing` ("En validation"), `waiting` ("En attente"), `blocked` ("Bloqué"),
 * `done` ("Terminé") and `cancelled` ("Annulé"). A space renames or hides a status, it never adds
 * or removes a key, so the set is closed here.
 *
 * @type {'triage' | 'backlog' | 'todo' | 'progress' | 'review' | 'testing' | 'waiting' | 'blocked' | 'done' | 'cancelled'}
 */
export type StatusKey =
  | 'triage'
  | 'backlog'
  | 'todo'
  | 'progress'
  | 'review'
  | 'testing'
  | 'waiting'
  | 'blocked'
  | 'done'
  | 'cancelled';

/**
 * Constant STATUS_KEYS
 *
 * @description
 * The ten status keys in the order of the workflow, the order of `STATUS_KEYS` of
 * `@cadenway/contracts`.
 *
 * @type {readonly StatusKey[]}
 */
export const STATUS_KEYS: readonly StatusKey[] = Object.freeze([
  'triage',
  'backlog',
  'todo',
  'progress',
  'review',
  'testing',
  'waiting',
  'blocked',
  'done',
  'cancelled',
]);
