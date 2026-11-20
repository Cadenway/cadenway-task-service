/** A list and the settings needed by intake, read under the requested locks. */
export interface ResolveIntakePlacementOutput {
  // #region Properties
  /** Parent space identifier. */
  readonly spaceId: string;

  /** Whether submission is suspended while the list is archived. */
  readonly archived: boolean;

  /** Current configuration of task statuses. */
  readonly statuses: Readonly<
    Record<
      | 'triage'
      | 'backlog'
      | 'todo'
      | 'progress'
      | 'review'
      | 'testing'
      | 'waiting'
      | 'blocked'
      | 'done'
      | 'cancelled',
      { readonly name: string | null; readonly hidden: boolean }
    >
  >;

  /** Effective list role for the supplied viewer, or null when no viewer was supplied. */
  readonly role: 'edit' | 'comment' | 'view' | null;
  // #endregion
}
