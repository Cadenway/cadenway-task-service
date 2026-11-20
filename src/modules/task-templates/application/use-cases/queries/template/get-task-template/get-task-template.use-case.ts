import type { TaskTemplateCaller } from '../../../../models/template/task-template-caller.model.js';
import type { TaskTemplateRecord } from '../../../../models/template/task-template-record.model.js';
import { TaskTemplateRefusal } from '../../../../models/template/task-template-refusal.model.js';
import type { TaskTemplateAuthorization } from '../../../../services/template/task-template-authorization.service.js';
import type { TaskTemplateUnitOfWork } from '../../../../ports/outbound/transactions/template/task-template-unit-of-work.port.js';

/** Reads one template in a space visible to the caller. */
export class GetTaskTemplate {
  // #region Constructor
  /** Wires space authorization and library persistence. */
  public constructor(
    private readonly unitOfWork: TaskTemplateUnitOfWork,
    private readonly sources: TaskTemplateAuthorization,
  ) {}
  // #endregion

  // #region Methods
  /** Reads the template and access in the same snapshot. */
  public async execute(
    caller: TaskTemplateCaller,
    templateId: string,
  ): Promise<TaskTemplateRecord> {
    return this.unitOfWork.read(async (store): Promise<TaskTemplateRecord> => {
      await this.sources.requireSpace(caller, 'read');
      const template = await store.templates.find(
        caller.organizationId,
        caller.spaceId,
        templateId,
      );
      if (template === null) {
        throw new TaskTemplateRefusal(404, 'template.not-found');
      }
      return template;
    });
  }
  // #endregion
}
