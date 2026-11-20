import type { TaskTemplateCaller } from '../../../../models/template/task-template-caller.model.js';
import type { TaskTemplatePosition } from '../../../../models/template/task-template-position.model.js';
import type { TaskTemplateRecord } from '../../../../models/template/task-template-record.model.js';
import type { TaskTemplateAuthorization } from '../../../../services/template/task-template-authorization.service.js';
import type { TaskTemplateUnitOfWork } from '../../../../ports/outbound/transactions/template/task-template-unit-of-work.port.js';

/** Reads a bounded page from the caller's visible space template library. */
export class ListTaskTemplates {
  // #region Constructor
  /** Wires space authorization and library persistence. */
  public constructor(
    private readonly unitOfWork: TaskTemplateUnitOfWork,
    private readonly sources: TaskTemplateAuthorization,
  ) {}
  // #endregion

  // #region Methods
  /** Reads one extra row to determine whether a further page exists. */
  public async execute(
    caller: TaskTemplateCaller,
    after: TaskTemplatePosition | null,
    limit: number,
  ): Promise<readonly TaskTemplateRecord[]> {
    return this.unitOfWork.read(async (store): Promise<readonly TaskTemplateRecord[]> => {
      await this.sources.requireSpace(caller, 'read');
      return store.templates.list(caller.organizationId, caller.spaceId, after, limit + 1);
    });
  }
  // #endregion
}
