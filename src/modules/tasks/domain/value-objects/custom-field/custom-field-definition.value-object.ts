/** An active definition with a stable ID, immutable type and zero-based position within its space. */
export interface CustomFieldDefinition {
  // #region Properties
  /** Canonical lowercase UUID v7. */
  readonly id: string;

  /** Space the definition belongs to. */
  readonly spaceId: string;

  /** Trimmed display name. */
  readonly name: string;

  /** Immutable value kind. */
  readonly type: 'number' | 'text';

  /** Zero-based position in active definition order. */
  readonly position: number;

  /** Whether the definition is the space's active sprint-points source. */
  readonly sprintPoints: boolean;

  /** Positive version of the definition, shared with its ETag. */
  readonly version: number;
  // #endregion
}
