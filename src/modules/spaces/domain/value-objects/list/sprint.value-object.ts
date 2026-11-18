/**
 * Interface Sprint
 *
 * @description
 * What makes a list a sprint (`Sprint` of `openapi/internal/task-service.yaml`, "Une période
 * datée, avec un objectif et un suivi d’avancement."). Its state follows from its dates: there is
 * no start or completion ("Sprints" of `openapi/public/lists.yaml`).
 */
export interface Sprint {
  // #region Properties
  /**
   * Property startDate
   *
   * @description
   * "Début", the first day of the sprint, a calendar date `YYYY-MM-DD`.
   *
   * @type {string}
   * @readonly
   */
  readonly startDate: string;

  /**
   * Property endDate
   *
   * @description
   * "Fin", the last day of the sprint, a calendar date `YYYY-MM-DD` on or after `startDate`.
   *
   * @type {string}
   * @readonly
   */
  readonly endDate: string;

  /**
   * Property goal
   *
   * @description
   * "Objectif du sprint", trimmed, 1 to 300 characters; `null` when there is none.
   *
   * @type {string | null}
   * @readonly
   */
  readonly goal: string | null;
  // #endregion
}
