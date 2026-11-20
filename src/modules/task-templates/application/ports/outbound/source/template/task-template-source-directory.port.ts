import type { TaskTemplateAccess } from '../../../../models/template/task-template-access.model.js';
import type { TaskTemplateCaller } from '../../../../models/template/task-template-caller.model.js';
import type { TaskTemplateSource } from '../../../../models/template/task-template-source.model.js';

/** Reads task content and verifies library access in the caller's transaction. */
export interface TaskTemplateSourceDirectory {
  // #region Methods
  /** Resolves actual space access and source audience. */
  scope(
    input: TaskTemplateCaller,
    mode: 'read' | 'prepare' | 'write',
    listId?: string,
  ): Promise<TaskTemplateAccess>;

  /** Reads the content the task owner allows to enter a template. */
  task(input: TaskTemplateCaller, taskKey: string): Promise<TaskTemplateSource>;
  // #endregion
}
