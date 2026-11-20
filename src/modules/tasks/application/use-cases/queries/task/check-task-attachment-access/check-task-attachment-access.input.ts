/** The verified actor and the attachment operation to authorize. */
export interface CheckTaskAttachmentAccessInput {
  // #region Properties
  /** Organization from the verified internal token. */
  readonly organizationId: string;

  /** Account from the verified internal token. */
  readonly actorUserId: string;

  /** Key of the task whose attachments are requested. */
  readonly taskKey: string;

  /** Whether the attachment operation reads or changes metadata. */
  readonly mode: 'read' | 'write';
  // #endregion
}
