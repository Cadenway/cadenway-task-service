/** Content copied into a space's template library. */
export interface TaskTemplateDraft {
  // #region Properties
  /** Tenant that owns the snapshot. */
  readonly organizationId: string;

  /** Space containing the library. */
  readonly spaceId: string;

  /** Name displayed in the library. */
  readonly name: string;

  /** Initial title when instantiating the template. */
  readonly title: string;

  /** Copied Markdown without mention metadata. */
  readonly description: string | null;

  /** Copied priority. */
  readonly priority: 'urgente' | 'haute' | 'moyenne' | 'basse';

  /** Copied labels in their original order. */
  readonly labels: readonly string[];

  /** Ordered item texts. */
  readonly checklist: readonly string[];

  /** Ordered live direct subtask names. */
  readonly subtasks: readonly string[];
  // #endregion
}
