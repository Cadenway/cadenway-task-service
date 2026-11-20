/** Validated upload declaration bound to the reservation idempotency key. */
export interface IntakeAttachmentDeclaration {
  // #region Properties
  /** Original file name, retained only in the private reservation. */
  readonly fileName: string;

  /** Declared media type. Storage checks the actual bytes. */
  readonly contentType: string;

  /** Declared size in bytes. */
  readonly sizeBytes: number;
  // #endregion
}
