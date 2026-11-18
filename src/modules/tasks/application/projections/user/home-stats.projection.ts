/**
 * Interface HomeStatsView
 *
 * @description
 * The counters of "Accueil" (`HomeStats` of the contract) over the tasks assigned to the actor,
 * subtasks included.
 */
export interface HomeStatsView {
  // #region Properties
  /** The assigned tasks that are not closed ("Assignées à moi"). */
  readonly assigned: number;

  /** Those that are late ("En retard"). */
  readonly late: number;

  /** Those that are not closed and due `today` ("Aujourd’hui"). */
  readonly dueToday: number;

  /** The assigned tasks of the key `done` ("Terminées"). */
  readonly done: number;
  // #endregion
}
