import type { SpaceState } from '../../../domain/value-objects/space/space-state.value-object.js';

/**
 * Interface SpaceView
 *
 * @description
 * A space as the routes return it: its state and the key its next task would take now ("Les tâches seront numérotées CAD-1, CAD-2…"), a preview that reserves nothing.
 */
export interface SpaceView {
  // #region Properties
  /**
   * Property space
   *
   * @description
   * The space.
   *
   * @type {SpaceState}
   * @readonly
   */
  readonly space: SpaceState;

  /**
   * Property nextKey
   *
   * @description
   * The key of the next task created in the space, `<prefix>-<n>`.
   *
   * @type {string}
   * @readonly
   */
  readonly nextKey: string;
  // #endregion
}
