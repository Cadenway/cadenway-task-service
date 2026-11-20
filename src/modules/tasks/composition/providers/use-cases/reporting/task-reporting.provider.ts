import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { ReportingUnitOfWork } from '../../../../application/ports/outbound/transactions/reporting/reporting-unit-of-work.port.js';
import { ExportListTasks } from '../../../../application/use-cases/queries/reporting/export-list-tasks/export-list-tasks.use-case.js';
import { GetListTimesheet } from '../../../../application/use-cases/queries/reporting/get-list-timesheet/get-list-timesheet.use-case.js';
import { GetListWorkload } from '../../../../application/use-cases/queries/reporting/get-list-workload/get-list-workload.use-case.js';
import { GetTeamDashboard } from '../../../../application/use-cases/queries/reporting/get-team-dashboard/get-team-dashboard.use-case.js';
import { TenantReportingUnitOfWork } from '../../../../infrastructure/persistence/drizzle/transactions/reporting/tenant-reporting.unit-of-work.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';

const reportingUnitOfWork = Symbol('ReportingUnitOfWork');
const useCases = [ExportListTasks, GetListTimesheet, GetListWorkload, GetTeamDashboard] as const;

/** Binds report queries to a read-only tenant snapshot and the existing access directories. */
export const taskReportingProviders: readonly FactoryProvider[] = [
  {
    provide: reportingUnitOfWork,
    inject: [TenantTransactionRunner],
    useFactory: (runner: TenantTransactionRunner): ReportingUnitOfWork =>
      new TenantReportingUnitOfWork(runner),
  },
  ...useCases.map((UseCase) => ({
    provide: UseCase,
    inject: [reportingUnitOfWork, MEMBER_DIRECTORY, SPACE_DIRECTORY],
    useFactory: (work: ReportingUnitOfWork, members: MemberDirectory, spaces: SpaceDirectory) =>
      new UseCase(work, members, spaces),
  })),
];
