/**
 * Interface ListActor
 *
 * @description
 * Who archived or deleted a list, or deleted a space (`archivedBy` of `TaskList`, the
 * `deleted_by_*` columns of a tombstone, `Actor` of `openapi/internal/task-service.yaml`): a person
 * (`user`, `id` is the account), an automation rule (`automation`), the Git integration (`git`) or
 * a service (`system`, `id` is its name).
 */
export interface ListActor {
  // #region Properties
  /**
   * Property type
   *
   * @description
   * Kind of actor.
   *
   * @type {'user' | 'automation' | 'git' | 'system'}
   * @readonly
   */
  readonly type: 'user' | 'automation' | 'git' | 'system';

  /**
   * Property id
   *
   * @description
   * Id of the account, the automation rule, the Git integration or the service; never empty.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;
  // #endregion
}

/**
 * Constant LIST_ACTOR_TYPES
 *
 * @description
 * The actor types of `Actor` today (`x-extensible-enum` of `openapi/internal/task-service.yaml`),
 * the values the checks `lists_archived_by_type_check`, `lists_deleted_by_type_check` and
 * `spaces_deleted_by_type_check` of the tables allow, to refuse any other in
 * a stored state.
 *
 * @type {readonly ListActor['type'][]}
 */
export const LIST_ACTOR_TYPES: readonly ListActor['type'][] = Object.freeze([
  'user',
  'automation',
  'git',
  'system',
]);
