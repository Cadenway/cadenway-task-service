import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { FactoryProvider } from '@nestjs/common';

import { ListPriorSprints } from '../../../../../spaces/public/reporting/list-prior-sprints.js';
import { ResolveSprintLifetimes } from '../../../../../spaces/public/reporting/resolve-sprint-lifetimes.js';
import { TaskRefusal } from '../../../../application/models/task/task-refusal.model.js';
import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { SprintReportUnitOfWork } from '../../../../application/ports/outbound/transactions/reporting/sprint-report-unit-of-work.port.js';
import { GetSprintReport } from '../../../../application/use-cases/queries/reporting/get-sprint-report/get-sprint-report.use-case.js';
import { CalendarDate } from '../../../../domain/value-objects/task/calendar-date.value-object.js';
import { DrizzleSprintHistoryRepository } from '../../../../infrastructure/persistence/drizzle/repositories/sprint-history/drizzle-sprint-history.repository.js';
import { DrizzleSprintReportRepository } from '../../../../infrastructure/persistence/drizzle/repositories/sprint-report/drizzle-sprint-report.repository.js';
import { sprintObservedDay } from '../../../../infrastructure/persistence/drizzle/repositories/sprint-report/sprint-report-calendar.repository.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';

/** Supplies the list scope and history activation within the same report snapshot. */
function bindSprintMetadata(
  history: DrizzleSprintHistoryRepository,
  listPriorSprints: ListPriorSprints,
  resolveSprintLifetimes: ResolveSprintLifetimes,
): ConstructorParameters<typeof DrizzleSprintReportRepository>[1] {
  return async (organizationId, request, snapshot) => {
    const { sprint, serverObservedAt, timeZone, viewer } = request;
    const scope = { organizationId, viewerUserId: viewer.userId, viewerRole: viewer.role };
    const day = sprintObservedDay(serverObservedAt, timeZone);
    const completedThroughDate =
      day.endsAt <= serverObservedAt
        ? day.date
        : (CalendarDate.parse(day.date).plusDays(-1)?.format() ?? null);
    const coverageStartedAt = await history.coverageStartedAt();
    const { sprints: earlier } = await listPriorSprints.execute({
      ...scope,
      spaceId: sprint.spaceId,
      beforeStartDate: sprint.startDate,
      completedThroughDate,
    });
    const { sprints } = await resolveSprintLifetimes.execute({
      ...scope,
      coverageStartedAt,
      observedAt: serverObservedAt,
      snapshot,
      sprints: [sprint, ...earlier.map((prior) => ({ ...prior, spaceId: sprint.spaceId }))],
    });
    const [current, ...prior] = sprints;
    if (current?.listId !== sprint.listId) {
      throw new TaskRefusal({ reason: 'list-not-found' });
    }
    return { coverageStartedAt, current, prior };
  };
}

/** Wires the sprint report to its own history and to the Spaces public reporting providers. */
export const getSprintReportProvider: FactoryProvider<GetSprintReport> = {
  provide: GetSprintReport,
  inject: [
    TenantTransactionRunner,
    MEMBER_DIRECTORY,
    SPACE_DIRECTORY,
    ListPriorSprints,
    ResolveSprintLifetimes,
  ],
  useFactory: (
    runner: TenantTransactionRunner,
    members: MemberDirectory,
    spaces: SpaceDirectory,
    listPriorSprints: ListPriorSprints,
    resolveSprintLifetimes: ResolveSprintLifetimes,
  ): GetSprintReport => {
    const work: SprintReportUnitOfWork = {
      runReadOnly: (read) =>
        runner.run(
          ({ db }) => {
            const history = new DrizzleSprintHistoryRepository(db);
            return read(
              new DrizzleSprintReportRepository(
                history,
                bindSprintMetadata(history, listPriorSprints, resolveSprintLifetimes),
              ),
            );
          },
          { readOnly: true, isolationLevel: 'repeatable read' },
        ),
    };
    return new GetSprintReport(work, members, spaces);
  },
};
