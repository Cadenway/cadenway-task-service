/**
 * Interface AccessTarget
 *
 * @description
 * A space or a list someone asks access to (decision 4 of P3b-1), as another module reads it:
 * where it is, its names, its owner, and the access of the member who asks or answers.
 */
export interface AccessTarget {
  // #region Properties
  /**
   * Property kind
   *
   * @description
   * Whether the target is a space or a list.
   *
   * @type {'space' | 'list'}
   * @readonly
   */
  readonly kind: 'space' | 'list';

  /**
   * Property spaceId
   *
   * @description
   * The space, or the space of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property spaceName
   *
   * @description
   * Name of the space ("Direction").
   *
   * @type {string}
   * @readonly
   */
  readonly spaceName: string;

  /**
   * Property spaceOwnerUserId
   *
   * @description
   * Account of the owner of the space, whom the notice of a request names.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceOwnerUserId: string;

  /**
   * Property listId
   *
   * @description
   * The list of a list target; `null` for a space.
   *
   * @type {string | null}
   * @readonly
   */
  readonly listId: string | null;

  /**
   * Property listName
   *
   * @description
   * Name of the list of a list target; `null` for a space.
   *
   * @type {string | null}
   * @readonly
   */
  readonly listName: string | null;

  /**
   * Property viewerRole
   *
   * @description
   * The role of the member on the target: on the space for a space, on the list for a
   * list; `null` when they have none.
   *
   * @type {'edit' | 'comment' | 'view' | null}
   * @readonly
   */
  readonly viewerRole: 'edit' | 'comment' | 'view' | null;

  /**
   * Property viewerManages
   *
   * @description
   * Whether the member answers requests for the target: manages the space for a space,
   * has `edit` on the list for a list.
   *
   * @type {boolean}
   * @readonly
   */
  readonly viewerManages: boolean;
  // #endregion
}
