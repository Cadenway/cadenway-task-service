/** One subject and optional task display request for a tenant viewer. */
export interface NotificationSubject {
  // #region Properties
  /** Reference kind determines which owning capability checks the resource. */
  readonly kind: 'task-id' | 'task-key' | 'list' | 'space';

  /** UUID or exact task key, according to the kind. */
  readonly reference: string;

  /** Display is requested only for a task. */
  readonly display?: { readonly commentId?: string };
  // #endregion
}
