import type { TaskTemplateAccess } from '../../../application/models/template/task-template-access.model.js';
import type { TaskTemplateCaller } from '../../../application/models/template/task-template-caller.model.js';
import type { TaskTemplateSource } from '../../../application/models/template/task-template-source.model.js';
import type { TaskTemplateSourceDirectory } from '../../../application/ports/outbound/source/template/task-template-source-directory.port.js';
import type { ResolveTaskTemplateSpace } from '../../../../spaces/public/space/resolve-task-template-space.js';
import type { ReadTaskTemplateSource } from '../../../../tasks/public/task/read-task-template-source.js';

/** Connects the library to the modules that own its access and source content. */
export class OwningTaskTemplateSourceDirectory implements TaskTemplateSourceDirectory {
  // #region Constructor
  /** Connects both owners to the library's transaction. */
  public constructor(
    private readonly spaces: ResolveTaskTemplateSpace,
    private readonly tasks: ReadTaskTemplateSource,
  ) {}
  // #endregion

  // #region Methods
  /** Asks the space owner for the caller's current roles. */
  public async scope(
    input: TaskTemplateCaller,
    mode: 'read' | 'prepare' | 'write',
    listId?: string,
  ): Promise<TaskTemplateAccess> {
    return this.spaces.execute({ ...input, mode, ...(listId === undefined ? {} : { listId }) });
  }

  /** Asks the task owner for the current source snapshot. */
  public async task(input: TaskTemplateCaller, taskKey: string): Promise<TaskTemplateSource> {
    return this.tasks.execute({ ...input, taskKey });
  }
  // #endregion
}
