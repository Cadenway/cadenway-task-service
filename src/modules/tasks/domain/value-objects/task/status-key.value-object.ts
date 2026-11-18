/**
 * Type StatusKey
 *
 * @description
 * Key of a task status, as `StatusKey` of `openapi/internal/task-service.yaml:3398-3416` names it:
 * `triage` ("À trier"), `backlog` ("À planifier"), `todo` ("À faire"), `progress` ("En cours"),
 * `review` ("En revue"), `testing` ("En validation"), `waiting` ("En attente"), `blocked`
 * ("Bloqué"), `done` ("Terminé") and `cancelled` ("Annulé"). The domain cannot import
 * `@cadenway/contracts`, so the closed set is repeated here and checked against it by its spec.
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
