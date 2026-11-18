import type { LookColor } from '../look/look-color.value-object.js';
import type { LookIcon } from '../look/look-icon.value-object.js';
import type { SprintInput } from './sprint-input.value-object.js';

/**
 * Interface NewTaskList
 *
 * @description
 * What a creation of a list or a sprint asks for (`ListCreation` of
 * `openapi/internal/task-service.yaml`), before checks and normalization. The members with a
 * default in the contract (`icon` `null`, `color` `gris`, `sprint` `null`) arrive with their
 * value: the presentation applies the defaults.
 */
export interface NewTaskList {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * Organization of the request.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property spaceId
   *
   * @description
   * Space of the list, which the caller sees (checked by the application).
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property name
   *
   * @description
   * "Nom", as typed.
   *
   * @type {string}
   * @readonly
   */
  readonly name: string;

  /**
   * Property icon
   *
   * @description
   * Icon; `null` for the default one.
   *
   * @type {LookIcon | null}
   * @readonly
   */
  readonly icon: LookIcon | null;

  /**
   * Property color
   *
   * @description
   * Color.
   *
   * @type {LookColor}
   * @readonly
   */
  readonly color: LookColor;

  /**
   * Property sprint
   *
   * @description
   * The dates and the goal to create a sprint; `null` for a list.
   *
   * @type {SprintInput | null}
   * @readonly
   */
  readonly sprint: SprintInput | null;
  // #endregion
}
