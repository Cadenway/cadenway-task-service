import type { TeamDashboard } from '../../../../../domain/policies/reporting/dashboard.policy.js';
import type { TaskSummaryView } from '../../../../projections/task/task-summary.projection.js';

/** Dashboard statistics with ordinary task summaries for the overdue preview. */
export type GetTeamDashboardOutput = TeamDashboard<TaskSummaryView>;
