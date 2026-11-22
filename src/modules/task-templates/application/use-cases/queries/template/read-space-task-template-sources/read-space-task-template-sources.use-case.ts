import type { TaskTemplateUnitOfWork } from '../../../../ports/outbound/transactions/template/task-template-unit-of-work.port.js';

/** Reads the library's source lists while the caller holds the owning space's write lock. */
export class ReadSpaceTaskTemplateSources {
  // #region Constructor
  /** Uses the same tenant transaction as the visibility change. */
  public constructor(private readonly unitOfWork: TaskTemplateUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Returns one entry per distinct source, including null when a legacy origin is unknown. */
  public execute(organizationId: string, spaceId: string): Promise<readonly (string | null)[]> {
    return this.unitOfWork.run((store) => store.templates.sourceListIds(organizationId, spaceId));
  }
  // #endregion
}
