import type { StatusKey } from '../../../../../domain/value-objects/task/status-key.value-object.js';

/** A verified Git action with the current mapping's authorizing account. */
export interface ApplyGitTaskStatusInput {
  // #region Properties
  /** Organization from the verified internal token. */
  readonly organizationId: string;

  /** Integration from the verified internal actor. */
  readonly integrationId: string;

  /** Account that authorized this current repository mapping. */
  readonly mappingAuthorUserId: string;

  /** Stable task key from the verified delivery. */
  readonly taskKey: string;

  /** Space authorized by the active mapping. */
  readonly spaceId: string;

  /** Provider verified against the registered receiver. */
  readonly provider: 'github' | 'gitlab';

  /** Target status, or null for a link-only authorization. */
  readonly status: StatusKey | null;
  // #endregion
}
