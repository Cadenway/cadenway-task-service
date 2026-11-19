import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';
import type { SpaceState } from '../../../domain/value-objects/space/space-state.value-object.js';

/**
 * Interface SpaceView
 *
 * @description
 * A space as the routes return it: its state, the key its next task would take now ("Les tâches
 * seront numérotées CAD-1, CAD-2…", a preview that reserves nothing), and the access of the caller
 * after the request ("Access" of `openapi/public/spaces.yaml`).
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

  /**
   * Property callerRole
   *
   * @description
   * The role of the caller on the space itself; `null` when they see it only through the grants
   * of some of its lists.
   *
   * @type {AccessRole | null}
   * @readonly
   */
  readonly callerRole: AccessRole | null;

  /**
   * Property callerCanManage
   *
   * @description
   * Whether the caller manages the space: changes its visibility, shares it and deletes it.
   *
   * @type {boolean}
   * @readonly
   */
  readonly callerCanManage: boolean;
  // #endregion
}
