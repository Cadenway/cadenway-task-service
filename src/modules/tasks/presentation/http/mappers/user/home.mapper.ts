import type { Home } from '@cadenway/contracts/types/internal/task-service';

import type { HomeView } from '../../../../application/projections/user/home.projection.js';
import { toListSummary } from '../count/list-summary.mapper.js';
import { toTaskSummary } from '../task/task-summary.mapper.js';

/**
 * Function toHome
 *
 * @description
 * Maps "Accueil" to the `Home` of the contract: the statistics of the tasks assigned to the actor,
 * their next priorities, the current sprints and the first lists, the last two with their
 * counters. Nothing of it is paged.
 *
 * @param {HomeView} view - The home.
 * @returns {Home} The home of the contract.
 */
export function toHome(view: HomeView): Home {
  return {
    stats: {
      assigned: view.stats.assigned,
      late: view.stats.late,
      dueToday: view.stats.dueToday,
      done: view.stats.done,
    },
    priorities: view.priorities.map(toTaskSummary),
    sprints: view.sprints.map(toListSummary),
    lists: view.lists.map(toListSummary),
  };
}
