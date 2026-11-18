import type { HomeStatsView } from '../../../../projections/user/home-stats.projection.js';
import type { MyTaskCountsView } from '../../../../projections/user/my-task-counts.projection.js';
import type { TaskCountsView } from '../../../../projections/count/task-counts.projection.js';

/**
 * Interface TaskCounter
 *
 * @description
 * The counters of the tasks, without a lock, each in one statement whatever the number of lists.
 * Every method filters on the organization. A task is closed when its status is `done` or
 * `cancelled` (`CLOSED_STATUS_KEYS`); it is late when it is not closed and its due date is
 * strictly before `today`.
 */
export interface TaskCounter {
  // #region Methods
  /**
   * Method countsOfLists
   *
   * @description
   * Counts the top-level tasks of lists, subtasks left out.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists.
   * @param {string} today - The date of the caller, `YYYY-MM-DD`.
   * @returns {Promise<ReadonlyMap<string, TaskCountsView>>} The counts by list id; a list without a
   * task may be left out.
   */
  countsOfLists(
    organizationId: string,
    listIds: readonly string[],
    today: string,
  ): Promise<ReadonlyMap<string, TaskCountsView>>;

  /**
   * Method stateCountsOf
   *
   * @description
   * Counts the tasks assigned to an account in some spaces, subtasks included, by tab of "Mes
   * tâches".
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {readonly string[]} spaceIds - The spaces the actor sees.
   * @returns {Promise<MyTaskCountsView>} The tasks not closed and the closed ones.
   */
  stateCountsOf(
    organizationId: string,
    userId: string,
    spaceIds: readonly string[],
  ): Promise<MyTaskCountsView>;

  /**
   * Method homeStatsOf
   *
   * @description
   * Counts the tasks assigned to an account in some spaces, subtasks included, for "Accueil".
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {readonly string[]} spaceIds - The spaces the actor sees.
   * @param {string} today - The date of the caller, `YYYY-MM-DD`.
   * @returns {Promise<HomeStatsView>} The tasks not closed, the late ones, those not closed due
   * `today`, and those of the key `done`.
   */
  homeStatsOf(
    organizationId: string,
    userId: string,
    spaceIds: readonly string[],
    today: string,
  ): Promise<HomeStatsView>;
  // #endregion
}
