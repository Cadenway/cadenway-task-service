import type { SprintInput } from '../../../../../domain/value-objects/list/sprint-input.value-object.js';
import type { LookColor } from '../../../../../domain/value-objects/look/look-color.value-object.js';
import type { LookIcon } from '../../../../../domain/value-objects/look/look-icon.value-object.js';

/**
 * Interface CreateListInput
 *
 * @description
 * A new list or sprint in a space, with the defaults of the contract applied by the presentation layer (`icon` null, `color` gris).
 */
export interface CreateListInput {
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
   * Property spaceId
   *
   * @description
   * The space of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property name
   *
   * @description
   * "Nom", as sent.
   *
   * @type {string}
   * @readonly
   */
  readonly name: string;

  /**
   * Property icon
   *
   * @description
   * "Icône", `null` for the default icon.
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
   * Property sprint
   *
   * @description
   * The dates and the goal of a sprint, `null` for a list.
   *
   * @type {SprintInput | null}
   * @readonly
   */
  readonly sprint: SprintInput | null;
  // #endregion
}
