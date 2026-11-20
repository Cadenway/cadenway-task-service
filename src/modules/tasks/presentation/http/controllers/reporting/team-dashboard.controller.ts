import { GetTeamDashboardInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Controller, Get, Query } from '@nestjs/common';
import type { z } from 'zod';

import { GetTeamDashboard } from '../../../../application/use-cases/queries/reporting/get-team-dashboard/get-team-dashboard.use-case.js';
import { DashboardQuery } from '../../dto/input/reporting/dashboard-query.dto.js';
import { answerReportingRefusals } from '../../errors/reporting/reporting.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toTaskSummary } from '../../mappers/task/task-summary.mapper.js';

/** Dashboard counts for the caller's currently visible work. */
@Controller('internal/v1/reports')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TeamDashboardController {
  // #region Constructor
  /** Binds the dashboard query. */
  public constructor(private readonly dashboardQuery: GetTeamDashboard) {}
  // #endregion

  // #region Methods
  /** Returns the dashboard for the validated calendar observation. */
  @Get('team-dashboard')
  public async get(
    @Query() query: DashboardQuery,
  ): Promise<z.output<typeof GetTeamDashboardInternalResponse>> {
    const result = await answerReportingRefusals(() =>
      this.dashboardQuery.execute({
        ...toCaller(),
        today: query.today,
        timeZone: query.timeZone,
        weeks: query.weeks,
      }),
    );
    return GetTeamDashboardInternalResponse.parse({
      ...result,
      observedAt: result.observedAt.toISOString(),
      overdueTasks: result.overdueTasks.map(toTaskSummary),
    });
  }
  // #endregion
}
