import type { LookColor } from '../look/look-color.value-object.js';
import type { LookIcon } from '../look/look-icon.value-object.js';
import type { StatusesPatch } from '../status/statuses-patch.value-object.js';
import type { Visibility } from './visibility.value-object.js';

/**
 * Interface SpacePatch
 *
 * @description
 * A change of a space (`SpacePatch` of `openapi/internal/task-service.yaml`), a JSON Merge Patch:
 * a member left out is unchanged, and an empty patch changes nothing.
 */
export interface SpacePatch {
  // #region Properties
  /**
   * Property name
   *
   * @description
   * New name, as typed.
   *
   * @type {string | undefined}
   * @readonly
   */
  readonly name?: string;

  /**
   * Property prefix
   *
   * @description
   * New prefix; the application checks that no other space of the organization owns it.
   *
   * @type {string | undefined}
   * @readonly
   */
  readonly prefix?: string;

  /**
   * Property description
   *
   * @description
   * New description, as typed; `null` or an empty text removes it.
   *
   * @type {string | null | undefined}
   * @readonly
   */
  readonly description?: string | null;

  /**
   * Property icon
   *
   * @description
   * New icon; `null` for the initial.
   *
   * @type {LookIcon | null | undefined}
   * @readonly
   */
  readonly icon?: LookIcon | null;

  /**
   * Property color
   *
   * @description
   * New color.
   *
   * @type {LookColor | undefined}
   * @readonly
   */
  readonly color?: LookColor;

  /**
   * Property visibility
   *
   * @description
   * New visibility, which only some members may change.
   *
   * @type {Visibility | undefined}
   * @readonly
   */
  readonly visibility?: Visibility;

  /**
   * Property statuses
   *
   * @description
   * Change of the statuses by key; `null` puts back every default ("Rétablir par défaut").
   *
   * @type {StatusesPatch | null | undefined}
   * @readonly
   */
  readonly statuses?: StatusesPatch | null;
  // #endregion
}
