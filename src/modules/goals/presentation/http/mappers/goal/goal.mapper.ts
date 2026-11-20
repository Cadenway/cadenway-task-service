import type { Goal, GoalResult } from '@cadenway/contracts/types/internal/task-service';
import {
  decodeCursor,
  encodeCursor,
  getOrganizationContext,
  ProblemException,
} from '@cadenway/nest-common';

import type { GoalPosition } from '../../../../application/models/goal/goal-position.model.js';
import type { GoalView } from '../../../../application/models/goal/goal-view.model.js';

/** Reads the tenant and user from the verified internal principal. */
export function goalCaller(): { organizationId: string; userId: string } {
  const context = getOrganizationContext();
  if (
    context?.actor.type !== 'user' ||
    context.actor.id === null ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(context.actor.id)
  ) {
    throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
  }
  if (context.organizationId === null) {
    throw new ProblemException({ status: 403, code: 'auth.organization-required' });
  }
  return {
    organizationId: context.organizationId.toLowerCase(),
    userId: context.actor.id.toLowerCase(),
  };
}

/** Maps the visible result without exposing aggregate state. */
export function goalResult(result: GoalView['results'][number]): GoalResult {
  switch (result.kind) {
    case 'number':
      return {
        id: result.id,
        kind: result.kind,
        label: result.label,
        progressPercent: result.progressPercent,
        startValue: result.startValue,
        currentValue: result.currentValue,
        targetValue: result.targetValue,
      };
    case 'checkbox':
      return {
        id: result.id,
        kind: result.kind,
        label: result.label,
        progressPercent: result.progressPercent,
        checked: result.checked,
      };
    case 'list-progress':
      return {
        id: result.id,
        kind: result.kind,
        label: result.label,
        progressPercent: result.progressPercent,
        listId: result.listId,
        eligibleTaskCount: result.eligibleTaskCount,
        doneTaskCount: result.doneTaskCount,
      };
    case 'milestone':
      return {
        id: result.id,
        kind: result.kind,
        label: result.label,
        progressPercent: result.progressPercent,
        taskKey: result.taskKey,
        reached: result.reached,
      };
  }
}

/** Maps only the fields declared in the goal response. */
export function goalResponse(goal: GoalView): Goal {
  return {
    id: goal.id,
    name: goal.name,
    ownerUserId: goal.ownerUserId,
    dueDate: goal.dueDate,
    spaceId: goal.spaceId,
    quarter: goal.quarter,
    version: goal.version,
    progressPercent: goal.progressPercent,
    health: goal.health,
    results: goal.results.map(goalResult),
  };
}

/** Binds a page boundary to the current actor, organization, quarter and date. */
export function goalCursorScope(
  caller: { organizationId: string; userId: string },
  quarter: string,
  today: string,
): readonly string[] {
  return ['goals', caller.organizationId, caller.userId, quarter, today];
}

/** Encodes a stable keyset boundary. */
export function encodeGoalCursor(
  position: GoalPosition | null,
  scope: readonly string[],
): string | null {
  return position === null
    ? null
    : encodeCursor({ sort: [position.createdAt.toISOString()], id: position.id }, scope);
}

/** Rejects cursors outside their collection or unsupported SQL timestamps. */
export function decodeGoalCursor(
  cursor: string | undefined,
  scope: readonly string[],
): GoalPosition | null {
  if (cursor === undefined) return null;
  const value = decodeCursor(cursor, scope);
  const timestamp = value.sort[0];
  if (
    value.sort.length === 1 &&
    typeof timestamp === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value.id)
  ) {
    const createdAt = new Date(timestamp);
    if (
      !Number.isNaN(createdAt.getTime()) &&
      createdAt.getUTCFullYear() >= 1970 &&
      createdAt.getUTCFullYear() <= 9999 &&
      createdAt.toISOString() === timestamp
    )
      return { createdAt, id: value.id };
  }
  throw new ProblemException({
    status: 400,
    code: 'request.invalid',
    details: {
      issues: [
        {
          in: 'query',
          path: 'cursor',
          code: 'invalid_cursor',
          message: 'Expected a cursor from this goal collection.',
        },
      ],
    },
  });
}
