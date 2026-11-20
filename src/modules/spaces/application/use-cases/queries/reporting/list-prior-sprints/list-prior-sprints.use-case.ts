import type { PriorSprintsUnitOfWork } from '../../../../ports/outbound/transactions/reporting/prior-sprints-unit-of-work.port.js';
import type { ListPriorSprintsInput } from './list-prior-sprints.input.js';
import type { ListPriorSprintsOutput } from './list-prior-sprints.output.js';

/** Selects the prior sprints visible to the already verified report reader. */
export class ListPriorSprints {
  // #region Constructor
  /** Binds the lookup to the tenant snapshot of the report. */
  public constructor(private readonly unitOfWork: PriorSprintsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Returns the most recent four completed visible sprints, oldest first. */
  public async execute(input: ListPriorSprintsInput): Promise<ListPriorSprintsOutput> {
    if (input.completedThroughDate === null) return { sprints: [] };
    const completedThroughDate = input.completedThroughDate;
    return this.unitOfWork.read(async (reader): Promise<ListPriorSprintsOutput> => {
      const sprints = await reader.listVisibleCompleted(
        input.organizationId,
        input.spaceId,
        { userId: input.viewerUserId, role: input.viewerRole },
        input.beforeStartDate,
        completedThroughDate,
      );
      return { sprints: [...sprints].reverse() };
    });
  }
  // #endregion
}
