/** A definition change, preserving every property omitted by the actor. */
export interface CustomFieldDefinitionPatch {
  // #region Properties
  /** New name as entered, to be trimmed. */
  readonly name?: string;

  /** New zero-based position in the active order. */
  readonly position?: number;

  /** Whether to designate this field or clear its designation. */
  readonly sprintPoints?: boolean;
  // #endregion
}
