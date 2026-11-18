/**
 * Type PriorityKey
 *
 * @description
 * Priority of a task, from the most to the least urgent, as `PriorityKey` of
 * `openapi/internal/task-service.yaml:3417-3427` names it: `urgente` ("Urgente"), `haute`
 * ("Haute"), `moyenne` ("Moyenne", the default) and `basse` ("Basse"). A closed set, repeated here
 * because the domain cannot import `@cadenway/contracts`.
 *
 * @type {'urgente' | 'haute' | 'moyenne' | 'basse'}
 */
export type PriorityKey = 'urgente' | 'haute' | 'moyenne' | 'basse';

/**
 * Constant PRIORITY_KEYS
 *
 * @description
 * The four priorities in the order of `PRIORITY_KEYS` of `@cadenway/contracts`.
 *
 * @type {readonly PriorityKey[]}
 */
export const PRIORITY_KEYS: readonly PriorityKey[] = Object.freeze([
  'urgente',
  'haute',
  'moyenne',
  'basse',
]);
