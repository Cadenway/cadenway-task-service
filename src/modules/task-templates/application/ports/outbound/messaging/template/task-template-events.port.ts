import type { TaskTemplateRecord } from '../../../../models/template/task-template-record.model.js';

/** Records template creation and deletion in the library transaction. */
export interface TaskTemplateEvents {
  // #region Methods
  /** Appends a change for an explicit create or delete. */
  changed(
    template: TaskTemplateRecord,
    actorUserId: string,
    action: 'created' | 'deleted',
  ): Promise<void>;
  // #endregion
}
