/**
 * Interface VisibleSpace
 *
 * @description
 * A space a member sees, as other modules read it (`Space` of `openapi/internal/task-service.yaml`):
 * primitive and readonly members only, so that no type of the domain of this module crosses the
 * public entry point. `nextKey` is a preview of the next task key that reserves nothing.
 */
export interface VisibleSpace {
  // #region Properties
  /**
   * Property id
   *
   * @description
   * Id of the space.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;

  /**
   * Property name
   *
   * @description
   * Name of the space.
   *
   * @type {string}
   * @readonly
   */
  readonly name: string;

  /**
   * Property prefix
   *
   * @description
   * Current prefix of the task keys of the space.
   *
   * @type {string}
   * @readonly
   */
  readonly prefix: string;

  /**
   * Property description
   *
   * @description
   * Description of the space, `null` when there is none.
   *
   * @type {string | null}
   * @readonly
   */
  readonly description: string | null;

  /**
   * Property icon
   *
   * @description
   * Icon of the space, `null` for its initial.
   *
   * @type {string | null}
   * @readonly
   */
  readonly icon: string | null;

  /**
   * Property color
   *
   * @description
   * Color of the space.
   *
   * @type {string}
   * @readonly
   */
  readonly color: string;

  /**
   * Property visibility
   *
   * @description
   * Who sees the space: the whole organization, or its owner only.
   *
   * @type {'organization' | 'private'}
   * @readonly
   */
  readonly visibility: 'organization' | 'private';

  /**
   * Property ownerUserId
   *
   * @description
   * Account of the owner of the space.
   *
   * @type {string}
   * @readonly
   */
  readonly ownerUserId: string;

  /**
   * Property statuses
   *
   * @description
   * How the space names and uses each of the ten statuses; a hidden status cannot be given to a
   * task of the space.
   *
   * @type {Readonly<Record<'triage' | 'backlog' | 'todo' | 'progress' | 'review' | 'testing' | 'waiting' | 'blocked' | 'done' | 'cancelled', { readonly name: string | null; readonly hidden: boolean }>>}
   * @readonly
   */
  readonly statuses: Readonly<
    Record<
      | 'triage'
      | 'backlog'
      | 'todo'
      | 'progress'
      | 'review'
      | 'testing'
      | 'waiting'
      | 'blocked'
      | 'done'
      | 'cancelled',
      { readonly name: string | null; readonly hidden: boolean }
    >
  >;

  /**
   * Property nextKey
   *
   * @description
   * The key the next task of the space would take, `<prefix>-<n>`: a preview, valid only inside the
   * transaction that read it; the number is handed out by `AllocateTaskKeys`.
   *
   * @type {string}
   * @readonly
   */
  readonly nextKey: string;

  /**
   * Property createdAt
   *
   * @description
   * When the space was created.
   *
   * @type {Date}
   * @readonly
   */
  readonly createdAt: Date;

  /**
   * Property version
   *
   * @description
   * Version of the space, a positive integer.
   *
   * @type {number}
   * @readonly
   */
  readonly version: number;

  /**
   * Property callerRole
   *
   * @description
   * The role of the member on the space itself; `null` when they see it only through the
   * grants of some of its lists (decision 2 of P3b-1).
   *
   * @type {'edit' | 'comment' | 'view' | null}
   * @readonly
   */
  readonly callerRole: 'edit' | 'comment' | 'view' | null;

  /**
   * Property callerCanManage
   *
   * @description
   * Whether the member manages the space: changes its visibility, shares it and deletes
   * it (decision 3 of P3b-1).
   *
   * @type {boolean}
   * @readonly
   */
  readonly callerCanManage: boolean;
  // #endregion
}
