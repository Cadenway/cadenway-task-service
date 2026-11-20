/** A change to a stored task value, where null erases the entry. */
export interface CustomFieldValueChange {
  // #region Properties
  /** Stable ID of the active definition. */
  readonly fieldId: string;

  /** Validated value or null to remove it. */
  readonly value: number | string | null;
  // #endregion
}
