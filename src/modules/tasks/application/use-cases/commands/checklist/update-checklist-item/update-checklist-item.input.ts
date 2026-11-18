/**
 * Interface UpdateChecklistItemInput
 *
 * @description
 * The ticking or unticking of an item of a checklist.
 */
export interface UpdateChecklistItemInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The key of the task. */
  readonly taskKey: string;

  /** The item. */
  readonly checklistItemId: string;

  /** `true` ticks the item, `false` unticks it. */
  readonly done: boolean;

  /** The versions `If-Match` accepts, `null` when absent or `*`. */
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}
