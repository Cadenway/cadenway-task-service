/**
 * Interface SprintInput
 *
 * @description
 * The dates and the goal of a sprint as a creation or a change of a list sends them (`SprintInput`
 * of `openapi/internal/task-service.yaml`): the two dates always together.
 */
export interface SprintInput {
  // #region Properties
  /**
   * Property startDate
   *
   * @description
   * "Début", as sent: a calendar date `YYYY-MM-DD`.
   *
   * @type {string}
   * @readonly
   */
  readonly startDate: string;

  /**
   * Property endDate
   *
   * @description
   * "Fin", as sent: a calendar date `YYYY-MM-DD` on or after `startDate` ("La fin doit suivre le
   * début.").
   *
   * @type {string}
   * @readonly
   */
  readonly endDate: string;

  /**
   * Property goal
   *
   * @description
   * "Objectif du sprint", as typed; `null` or an empty text for none. Left out, it is unchanged by
   * a change of a sprint and `null` at a creation.
   *
   * @type {string | null | undefined}
   * @readonly
   */
  readonly goal?: string | null;
  // #endregion
}
