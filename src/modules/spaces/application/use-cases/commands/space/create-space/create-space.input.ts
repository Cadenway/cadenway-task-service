import type { LookColor } from '../../../../../domain/value-objects/look/look-color.value-object.js';
import type { LookIcon } from '../../../../../domain/value-objects/look/look-icon.value-object.js';
import type { Visibility } from '../../../../../domain/value-objects/space/visibility.value-object.js';

/**
 * Interface CreateSpaceInput
 *
 * @description
 * A new space, owned by the actor, with the defaults of the contract applied by the presentation layer (`icon` null, `color` gris, `visibility` organization).
 */
export interface CreateSpaceInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the verified internal token.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property actorUserId
   *
   * @description
   * The account of the actor of the internal token.
   *
   * @type {string}
   * @readonly
   */
  readonly actorUserId: string;

  /**
   * Property name
   *
   * @description
   * "Nom de l’espace", as sent.
   *
   * @type {string}
   * @readonly
   */
  readonly name: string;

  /**
   * Property prefix
   *
   * @description
   * "Préfixe", 2 to 5 letters A to Z.
   *
   * @type {string}
   * @readonly
   */
  readonly prefix: string;

  /**
   * Property description
   *
   * @description
   * "Description", `null` for none.
   *
   * @type {string | null}
   * @readonly
   */
  readonly description: string | null;

  /**
   * Property icon
   *
   * @description
   * "Icône", `null` for the initial.
   *
   * @type {LookIcon | null}
   * @readonly
   */
  readonly icon: LookIcon | null;

  /**
   * Property color
   *
   * @description
   * "Couleur".
   *
   * @type {LookColor}
   * @readonly
   */
  readonly color: LookColor;

  /**
   * Property visibility
   *
   * @description
   * "Confidentialité".
   *
   * @type {Visibility}
   * @readonly
   */
  readonly visibility: Visibility;
  // #endregion
}
