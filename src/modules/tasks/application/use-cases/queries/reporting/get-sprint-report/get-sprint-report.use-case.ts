import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { projectSprintReport } from '../../../../../domain/policies/reporting/sprint-report.policy.js';
import type { SprintReportHistory } from '../../../../models/reporting/sprint-report-history.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SprintReportReader } from '../../../../ports/outbound/persistence/reporting/sprint-report-reader.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { SprintReportUnitOfWork } from '../../../../ports/outbound/transactions/reporting/sprint-report-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { GetSprintReportInput } from './get-sprint-report.input.js';
import type { GetSprintReportOutput } from './get-sprint-report.output.js';

/** Projects a page of the caller-visible sprint's covered task history. */
export class GetSprintReport {
  // #region Properties
  /** Resolves current membership within the reporting snapshot. */
  private readonly viewers: ViewerResolver;
  // #endregion

  // #region Constructor
  /** Binds the repeatable-read transaction and the current authorization directories. */
  public constructor(
    private readonly unitOfWork: SprintReportUnitOfWork,
    members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
  }
  // #endregion

  // #region Methods
  /** Reads the authorized sprint and projects its currently visible history. */
  public async execute(input: GetSprintReportInput): Promise<GetSprintReportOutput> {
    return this.unitOfWork.runReadOnly(async (reader: SprintReportReader) => {
      const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
      const placement = await this.spaces.findVisibleList(
        input.organizationId,
        viewer,
        input.listId,
      );
      const sprint = placement?.list.sprint;
      if (placement === null || sprint === null || sprint === undefined) {
        throw new TaskRefusal({ reason: 'list-not-found' });
      }

      const visibleListIds = await this.spaces.visibleListIds(input.organizationId, viewer);
      const serverObservedAt = input.after?.serverObservedAt ?? input.serverObservedAt;
      const schedule = input.after?.schedule ?? {
        name: placement.list.name,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
      };
      const history: SprintReportHistory = await reader.read(input.organizationId, {
        sprint: {
          listId: placement.list.id,
          spaceId: placement.list.spaceId,
          ...schedule,
        },
        visibleListIds,
        viewer,
        today: input.today,
        timeZone: input.timeZone,
        serverObservedAt,
        snapshot: input.after?.snapshot ?? null,
        after: input.after?.date ?? null,
        limit: input.limit,
      });
      return {
        ...projectSprintReport(history.input),
        next:
          history.next === null
            ? null
            : { date: history.next, serverObservedAt, snapshot: history.snapshot, schedule },
      };
    });
  }
  // #endregion
}
