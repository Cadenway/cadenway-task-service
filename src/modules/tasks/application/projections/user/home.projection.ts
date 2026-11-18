import type { ListSummaryView } from '../count/list-summary.projection.js';
import type { TaskSummaryView } from '../task/task-summary.projection.js';
import type { HomeStatsView } from './home-stats.projection.js';

/**
 * Interface HomeView
 *
 * @description
 * The task part of "Accueil" (`Home` of the contract). `stats` and `priorities` include subtasks;
 * the counts of `sprints` and `lists` are those of top-level tasks, as everywhere else.
 */
export interface HomeView {
  // #region Properties
  /** The counters of the actor. */
  readonly stats: HomeStatsView;

  /** Seven tasks of the actor that are not closed ("Mes priorités"). */
  readonly priorities: readonly TaskSummaryView[];

  /** The sprints current on `today`, with the counts of their tasks, 10 at most. */
  readonly sprints: readonly ListSummaryView[];

  /** The first six lists in the order of the sidebar, with the counts of their tasks. */
  readonly lists: readonly ListSummaryView[];
  // #endregion
}
