/** The current viewer and the resources named in a stored receipt. */
export interface AssertCanReplayTaskReceiptInput {
  // #region Properties
  /** Organization owning the receipt's resources. */
  readonly organizationId: string;

  /** User permitted to read the receipt. */
  readonly actorUserId: string;

  /** Keys of live or archived tasks named by the receipt. */
  readonly taskKeys: readonly string[];

  /** Historical lists named by the receipt or its mutation request. */
  readonly listIds: readonly string[];

  /** Exact restorable entries for tasks trashed by the mutation. */
  readonly trash?: readonly { readonly taskKey: string; readonly entryId: string }[];

  /** Identifies the bulk receipt whose historical list scope must be proven. */
  readonly bulk?: { readonly key: string; readonly serializedResponse: string };

  /** Concealed failure used by the resource's route. */
  readonly notFound: 'list-not-found' | 'task-not-found';
  // #endregion
}
