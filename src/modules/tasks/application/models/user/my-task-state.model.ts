/**
 * Type MyTaskState
 *
 * @description
 * The tab of "Mes tâches" (`state` of `listMyTasksInternal`): `open` ("À faire", not closed) or
 * `closed` ("Terminées": `done` and `cancelled`).
 *
 * @type {'open' | 'closed'}
 */
export type MyTaskState = 'open' | 'closed';
