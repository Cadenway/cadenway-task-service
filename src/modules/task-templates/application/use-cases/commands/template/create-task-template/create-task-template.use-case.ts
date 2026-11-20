import type { TaskTemplateCaller } from '../../../../models/template/task-template-caller.model.js';
import type { TaskTemplateRecord } from '../../../../models/template/task-template-record.model.js';
import { TaskTemplateRefusal } from '../../../../models/template/task-template-refusal.model.js';
import type { TaskTemplateAuthorization } from '../../../../services/template/task-template-authorization.service.js';
import type { TaskTemplateUnitOfWork } from '../../../../ports/outbound/transactions/template/task-template-unit-of-work.port.js';

/** Takes an authorized copy of a task into the space template library. */
export class CreateTaskTemplate {
  // #region Constructor
  /** Wires content authorization and library persistence. */
  public constructor(
    private readonly unitOfWork: TaskTemplateUnitOfWork,
    private readonly sources: TaskTemplateAuthorization,
  ) {}
  // #endregion

  // #region Methods
  /** Holds the space across the capacity check, insert and event append. */
  public async execute(
    caller: TaskTemplateCaller,
    taskKey: string,
    name: string | undefined,
  ): Promise<TaskTemplateRecord> {
    return this.unitOfWork.run(async (store): Promise<TaskTemplateRecord> => {
      await this.sources.requireSpace(caller, 'prepare');
      const source = await this.sources.readSource(caller, taskKey);
      if ((await store.templates.count(caller.organizationId, caller.spaceId)) >= 50) {
        throw new TaskTemplateRefusal(422, 'template.limit-reached');
      }
      const template = await store.templates.create({
        ...source,
        organizationId: caller.organizationId,
        spaceId: caller.spaceId,
        name:
          name ??
          source.title
            .slice(0, 80)
            .replace(/[\uD800-\uDBFF]$/u, '')
            .trimEnd(),
      });
      await store.events.changed(template, caller.actorUserId, 'created');
      return template;
    });
  }
  // #endregion
}
