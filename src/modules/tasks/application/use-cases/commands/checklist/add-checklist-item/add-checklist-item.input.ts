/**
 * Interface AddChecklistItemInput
 *
 * @description
 * An item to add at the end of the checklist of a task. The route declares no `If-Match`.
 */
export interface AddChecklistItemInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The key of the task. */
  readonly taskKey: string;

  /** The text of the item, as the request sent it; the domain trims it. */
  readonly text: string;
  // #endregion
}
