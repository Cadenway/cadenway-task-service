/**
 * Interface VisibleList
 *
 * @description
 * A list or sprint a member sees, as other modules read it (`TaskList` of
 * `openapi/internal/task-service.yaml`): primitive and readonly members only, so that no type of
 * the domain of this module crosses the public entry point.
 */
export interface VisibleList {
  // #region Properties
  /**
   * Property id
   *
   * @description
   * Id of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;

  /**
   * Property spaceId
   *
   * @description
   * Id of the space of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property name
   *
   * @description
   * Name of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly name: string;

  /**
   * Property icon
   *
   * @description
   * Icon of the list, `null` for the default one.
   *
   * @type {string | null}
   * @readonly
   */
  readonly icon: string | null;

  /**
   * Property color
   *
   * @description
   * Color of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly color: string;

  /**
   * Property sprint
   *
   * @description
   * The dates (calendar dates `YYYY-MM-DD`) and the goal of a sprint; `null` for a list that is not
   * a sprint.
   *
   * @type {{ readonly startDate: string; readonly endDate: string; readonly goal: string | null } | null}
   * @readonly
   */
  readonly sprint: {
    readonly startDate: string;
    readonly endDate: string;
    readonly goal: string | null;
  } | null;

  /**
   * Property createdAt
   *
   * @description
   * When the list was created.
   *
   * @type {Date}
   * @readonly
   */
  readonly createdAt: Date;

  /**
   * Property version
   *
   * @description
   * Version of the list, a positive integer.
   *
   * @type {number}
   * @readonly
   */
  readonly version: number;

  /**
   * Property organizationAccess
   *
   * @description
   * The switch "Accès de l’organisation" of the list (P3b-1).
   *
   * @type {boolean}
   * @readonly
   */
  readonly organizationAccess: boolean;

  /**
   * Property archivedAt
   *
   * @description
   * When the list was archived (`archivedAt` of `TaskList`); `null` for a live list. An archived
   * list reads by its id and is left out of the lists of its space, of the overview and of
   * "Accueil" ("Lists" of `openapi/public/archives.yaml`).
   *
   * @type {Date | null}
   * @readonly
   */
  readonly archivedAt: Date | null;

  /**
   * Property archivedBy
   *
   * @description
   * Who archived the list (`archivedBy` of `TaskList`, an `Actor`); `null` for a live list.
   *
   * @type {{ readonly type: 'user' | 'automation' | 'git' | 'system'; readonly id: string } | null}
   * @readonly
   */
  readonly archivedBy: {
    readonly type: 'user' | 'automation' | 'git' | 'system';
    readonly id: string;
  } | null;

  /**
   * Property callerRole
   *
   * @description
   * The effective role of the member on the list (decision 2 of P3b-1): reads need any
   * role, changes of the list and its tasks need `edit`.
   *
   * @type {'edit' | 'comment' | 'view'}
   * @readonly
   */
  readonly callerRole: 'edit' | 'comment' | 'view';
  // #endregion
}
