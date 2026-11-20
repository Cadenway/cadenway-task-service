import type { StatusKey } from '../../../../../domain/value-objects/task/status-key.value-object.js';

/** Holds a published form's live destination in the caller's tenant transaction. */
export interface IntakeTaskPlacement {
  // #region Methods
  /** Locks the space and list in that order and returns their current statuses. A missing,
   * deleted or archived destination returns null. The locks last through transaction commit. */
  lock(
    organizationId: string,
    listId: string,
  ): Promise<{
    readonly spaceId: string;
    readonly statuses: Readonly<
      Record<StatusKey, { readonly name: string | null; readonly hidden: boolean }>
    >;
  } | null>;
  // #endregion
}
