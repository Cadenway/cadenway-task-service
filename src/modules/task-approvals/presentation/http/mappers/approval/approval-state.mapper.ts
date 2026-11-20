import type { TaskApprovalState } from '@cadenway/contracts/types/internal/task-service';
import { GetTaskApprovalInternalResponse } from '@cadenway/contracts/validators/internal/task-service';

import type { ApprovalState } from '../../../../application/models/approval/approval-state.model.js';

/** Maps only the fields exposed by the published approval response. */
export function toApprovalState(state: ApprovalState): TaskApprovalState {
  const current = state.current;
  return GetTaskApprovalInternalResponse.parse({
    taskKey: state.taskKey,
    taskVersion: state.taskVersion,
    taskStatus: state.taskStatus,
    current:
      current === null
        ? null
        : {
            roundId: current.roundId,
            requesterUserId: current.requesterUserId,
            requestedAt: current.requestedAt.toISOString(),
            status: current.status,
            reviewers: current.reviewers.map((reviewer) => ({
              reviewerUserId: reviewer.reviewerUserId,
              decision: reviewer.decision,
              decidedAt: reviewer.decidedAt?.toISOString() ?? null,
              commentId: reviewer.commentId,
            })),
          },
  });
}
