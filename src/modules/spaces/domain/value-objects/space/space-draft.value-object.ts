import type { LookColor } from '../look/look-color.value-object.js';
import type { LookIcon } from '../look/look-icon.value-object.js';
import type { SpaceStatuses } from '../status/space-statuses.value-object.js';
import type { Visibility } from './visibility.value-object.js';

/**
 * Interface SpaceDraft
 *
 * @description
 * A checked and normalized new space, what a repository inserts: PostgreSQL assigns its `id` and
 * `createdAt`, and its version starts at 1. Every member already satisfies the invariants of
 * `Space` (`Space` of `openapi/internal/task-service.yaml`).
 */
export interface SpaceDraft {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * Organization of the space, the organization of the request.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property name
   *
   * @description
   * "Nom de l’espace", trimmed, 1 to 80 characters.
   *
   * @type {string}
   * @readonly
   */
  readonly name: string;

  /**
   * Property prefix
   *
   * @description
   * Prefix of the task keys ("Préfixe"): 2 to 5 uppercase letters A to Z.
   *
   * @type {string}
   * @readonly
   */
  readonly prefix: string;

  /**
   * Property description
   *
   * @description
   * "Description", trimmed, 1 to 500 characters; `null` when there is none.
   *
   * @type {string | null}
   * @readonly
   */
  readonly description: string | null;

  /**
   * Property icon
   *
   * @description
   * Icon of the space; `null` for its initial ("Initiale").
   *
   * @type {LookIcon | null}
   * @readonly
   */
  readonly icon: LookIcon | null;

  /**
   * Property color
   *
   * @description
   * Color of the space.
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

  /**
   * Property ownerUserId
   *
   * @description
   * Account of the owner of the space: the member who created it, or the owner of the organization
   * after the owner of a private space left it ("Who changes what" of `openapi/public/spaces.yaml`).
   *
   * @type {string}
   * @readonly
   */
  readonly ownerUserId: string;

  /**
   * Property statuses
   *
   * @description
   * How the space names and uses its ten statuses.
   *
   * @type {SpaceStatuses}
   * @readonly
   */
  readonly statuses: SpaceStatuses;
  // #endregion
}
