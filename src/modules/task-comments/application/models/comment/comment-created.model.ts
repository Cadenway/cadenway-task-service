/** A committed comment creation for the transactional outbox. */
export interface CommentCreated {
  // #region Properties
  /** Tenant ID. */
  readonly organizationId: string;

  /** Actor recorded by the application for this fact. */
  readonly actor: { readonly type: 'user' | 'automation'; readonly id: string };

  /** Task key. */
  readonly taskKey: string;

  /** Task space ID. */
  readonly spaceId: string;

  /** Task list ID. */
  readonly listId: string;

  /** Post-change task version. */
  readonly taskVersion: number;

  /** New comment ID. */
  readonly commentId: string;

  /** Comment version. */
  readonly commentVersion: number;

  /** Current eligible mention recipients. */
  readonly mentionedUserIds?: readonly string[];

  /** Effective eligible watchers snapshotted for a creation. */
  readonly watcherIds?: readonly string[];

  /** Recipients newly added on edit. */
  readonly addedMentionUserIds?: readonly string[];

  /** Recipients removed on edit. */
  readonly removedMentionUserIds?: readonly string[];

  /** Eligible human reply target, when present. */
  readonly reply?: { readonly commentId: string; readonly userId: string };
  // #endregion
}
