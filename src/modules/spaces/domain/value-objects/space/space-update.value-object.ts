import type { Space } from '../../aggregates/space/space.aggregate.js';
import type { SpaceField } from './space-field.value-object.js';

/**
 * Interface SpaceUpdate
 *
 * @description
 * The result of a change of a space: the space after it and the members that changed. When
 * `changed` is empty, nothing changed and `space` is the same instance as before: the application
 * stores nothing and emits no `space.updated.v1`, whose `changed` has at least one member
 * (`asyncapi/task-service.yaml`).
 */
export interface SpaceUpdate {
  // #region Properties
  /**
   * Property space
   *
   * @description
   * The space after the change.
   *
   * @type {Space}
   * @readonly
   */
  readonly space: Space;

  /**
   * Property changed
   *
   * @description
   * The members whose value differs, in the order of `SpaceField`.
   *
   * @type {readonly SpaceField[]}
   * @readonly
   */
  readonly changed: readonly SpaceField[];
  // #endregion
}
