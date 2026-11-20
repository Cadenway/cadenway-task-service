import type { ApprovalActor } from '../../../../models/approval/approval-actor.model.js';

/** Request a fresh round under the expected task version. */
export type RequestTaskApprovalInput = ApprovalActor & {
  readonly expectedVersions: readonly number[] | null;
  readonly reviewerUserIds: readonly string[];
};
