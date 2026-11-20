import { getOrganizationContext, ProblemException } from '@cadenway/nest-common';
import type { CommentReadInput } from '../../../../application/models/comment/comment-read-input.model.js';

/** Builds the task scope from the verified internal context. */
export function toCommentReadInput(taskKey: string): CommentReadInput {
  const context = getOrganizationContext();
  if (
    context?.actor.type !== 'user' ||
    context.actor.id === null ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(context.actor.id)
  )
    throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
  if (context.organizationId === null)
    throw new ProblemException({ status: 403, code: 'auth.organization-required' });
  return {
    organizationId: context.organizationId.toLowerCase(),
    actorUserId: context.actor.id.toLowerCase(),
    taskKey,
  };
}
