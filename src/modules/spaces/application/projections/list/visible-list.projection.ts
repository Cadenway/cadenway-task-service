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
  // #endregion
}
