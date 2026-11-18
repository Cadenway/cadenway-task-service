/**
 * Type ActivityKind
 *
 * @description
 * Kind of an activity entry (`ActivityEntry.kind` of `openapi/internal/task-service.yaml:2645-2658`):
 * `create` ("a créé la tâche"), `status` ("a changé le statut"), `priority` ("a passé la priorité
 * à"), `due` ("a fixé l’échéance", "a déplacé l’échéance", "a retiré l’échéance") or `assign`
 * ("a assigné Inès Robert", "a retiré Inès Robert"). The contract may add kinds later
 * (`x-extensible-enum`); this version records these five.
 *
 * @type {'create' | 'status' | 'priority' | 'due' | 'assign'}
 */
export type ActivityKind = 'create' | 'status' | 'priority' | 'due' | 'assign';

/**
 * Constant ACTIVITY_KINDS
 *
 * @description
 * The five kinds in the order of the contract.
 *
 * @type {readonly ActivityKind[]}
 */
export const ACTIVITY_KINDS: readonly ActivityKind[] = Object.freeze([
  'create',
  'status',
  'priority',
  'due',
  'assign',
]);
