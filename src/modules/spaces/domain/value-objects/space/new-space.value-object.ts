import type { LookColor } from '../look/look-color.value-object.js';
import type { LookIcon } from '../look/look-icon.value-object.js';
import type { Visibility } from './visibility.value-object.js';

/**
 * Interface NewSpace
 *
 * @description
 * What a creation of a space asks for (`SpaceCreation` of `openapi/internal/task-service.yaml`),
 * before checks and normalization. The members with a default in the contract (`icon` `null`,
 * `color` `gris`, `visibility` `organization`) arrive with their value: the presentation applies
 * the defaults.
 */
export interface NewSpace {
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
   * Property ownerUserId
   *
   * @description
   * Account of the member who creates the space, its owner.
   *
   * @type {string}
   * @readonly
   */
  readonly ownerUserId: string;

  /**
   * Property name
   *
   * @description
   * "Nom de l’espace", as typed.
   *
   * @type {string}
   * @readonly
   */
  readonly name: string;

  /**
   * Property prefix
   *
   * @description
   * "Préfixe", as typed.
   *
   * @type {string}
   * @readonly
   */
  readonly prefix: string;

  /**
   * Property description
   *
   * @description
   * "Description", as typed; `null` or an empty text for none.
   *
   * @type {string | null}
   * @readonly
   */
  readonly description: string | null;

  /**
   * Property icon
   *
   * @description
   * Icon; `null` for the initial.
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
   * Property visibility
   *
   * @description
   * Who sees the space.
   *
   * @type {Visibility}
   * @readonly
   */
  readonly visibility: Visibility;
  // #endregion
}
