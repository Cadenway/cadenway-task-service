import type { TaskTemplateCaller } from '../../../../models/template/task-template-caller.model.js';
import { TaskTemplateRefusal } from '../../../../models/template/task-template-refusal.model.js';
import type { TaskTemplateAuthorization } from '../../../../services/template/task-template-authorization.service.js';
import type { TaskTemplateUnitOfWork } from '../../../../ports/outbound/transactions/template/task-template-unit-of-work.port.js';

/** Deletes an existing template and records its final revision. */
export class DeleteTaskTemplate {
  // #region Constructor
  /** Wires live space access, library persistence and the transactional outbox. */
  public constructor(
    private readonly unitOfWork: TaskTemplateUnitOfWork,
    private readonly sources: TaskTemplateAuthorization,
  ) {}
  // #endregion

  // #region Methods
  /** Checks space edit, resource identity and If-Match before deleting. */
  public async execute(
    caller: TaskTemplateCaller,
    templateId: string,
    expectedVersions: readonly number[] | null,
  ): Promise<void> {
    return this.unitOfWork.run(async (store): Promise<void> => {
      await this.sources.requireSpace(caller, 'prepare');
      await this.sources.requireSpace(caller, 'write');
      const { organizationId, spaceId, actorUserId } = caller;
      const template = await store.templates.find(organizationId, spaceId, templateId);
      if (template === null) {
        throw new TaskTemplateRefusal(404, 'template.not-found');
      }
      if (expectedVersions !== null && !expectedVersions.includes(template.version)) {
        throw new TaskTemplateRefusal(412, 'request.version-mismatch', {
          version: template.version,
        });
      }
      await store.templates.delete(organizationId, spaceId, templateId);
      await store.events.changed(
        { ...template, version: template.version + 1 },
        actorUserId,
        'deleted',
      );
    });
  }
  // #endregion
}
