/** Exact opaque ownership tuple received on Storage's verified intake attachment fact. */
export interface IntakeAttachmentOwnership {
  // #region Properties
  /** Organization recorded with the reservation. */
  readonly organizationId: string;

  /** Publication recorded with the reservation. */
  readonly publicationId: string;

  /** Attachment to which the verification applies. */
  readonly attachmentId: string;
  // #endregion
}
