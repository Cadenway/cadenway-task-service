import type { TaskTemplateDraft } from '../../../../models/template/task-template-draft.model.js';
import type { TaskTemplatePosition } from '../../../../models/template/task-template-position.model.js';
import type { TaskTemplateRecord } from '../../../../models/template/task-template-record.model.js';

/** Persists templates in the scope of their owning organization and space. */
export interface TaskTemplateRepository {
  // #region Methods
  /** Inserts the snapshot and returns its identity. */
  create(draft: TaskTemplateDraft): Promise<TaskTemplateRecord>;

  /** Reads the template in the caller's space. */
  find(organizationId: string, spaceId: string, id: string): Promise<TaskTemplateRecord | null>;

  /** Reads a bounded page in creation order. */
  list(
    organizationId: string,
    spaceId: string,
    after: TaskTemplatePosition | null,
    limit: number,
  ): Promise<readonly TaskTemplateRecord[]>;

  /** Counts the entries while the owning space is locked. */
  count(organizationId: string, spaceId: string): Promise<number>;

  /** Lists all provenance IDs, including the unknown sources of legacy templates. */
  sourceListIds(organizationId: string, spaceId: string): Promise<readonly (string | null)[]>;

  /** Deletes one template in the scoped space. */
  delete(organizationId: string, spaceId: string, id: string): Promise<void>;

  /** Clears a deleted space's library. */
  deleteForSpace(organizationId: string, spaceId: string): Promise<void>;
  // #endregion
}
