import type { TaskTemplateUnitOfWork } from '../../../../ports/outbound/transactions/template/task-template-unit-of-work.port.js';

/** Clears the template library when its owning space is deleted. */
export class RemoveSpaceTaskTemplates {
  // #region Constructor
  /** Uses the same tenant transaction as the space deletion. */
  public constructor(private readonly unitOfWork: TaskTemplateUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Removes all templates in the deleted space; the space event invalidates the whole library. */
  public async execute(organizationId: string, spaceId: string): Promise<void> {
    await this.unitOfWork.run((store): Promise<void> =>
      store.templates.deleteForSpace(organizationId, spaceId),
    );
  }
  // #endregion
}
