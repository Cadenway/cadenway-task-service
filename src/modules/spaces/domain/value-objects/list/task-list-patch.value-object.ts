import type { LookColor } from '../look/look-color.value-object.js';
import type { LookIcon } from '../look/look-icon.value-object.js';
import type { SprintInput } from './sprint-input.value-object.js';

/**
 * Interface TaskListPatch
 *
 * @description
 * A change of a list (`ListPatch` of `openapi/internal/task-service.yaml`), a JSON Merge Patch: a
 * member left out is unchanged, and an empty patch changes nothing.
 */
export interface TaskListPatch {
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
   * Property icon
   *
   * @description
   * New icon; `null` for the default one.
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
   * Property sprint
   *
   * @description
   * New dates, and optionally goal, of a sprint; `null` makes a sprint a list again and drops its
   * dates and goal.
   *
   * @type {SprintInput | null | undefined}
   * @readonly
   */
  readonly sprint?: SprintInput | null;

  /**
   * Property organizationAccess
   *
   * @description
   * Turns the switch "Accès de l’organisation" on or off; absent, it stays as it is.
   *
   * @type {boolean | undefined}
   * @readonly
   */
  readonly organizationAccess?: boolean;
  // #endregion
}
