import type { z } from 'zod';

/**
 * Function refuseTargetCount
 *
 * @description
 * Refuses a request for access that does not name exactly one target ("exactly one of `spaceId`,
 * `listId` and `taskKey`", `AccessRequestCreation` of `openapi/internal/task-service.yaml`; the
 * generated validator declares the three optional): none or several answer
 * `400 request.invalid` with one issue on the body, as the validation of the kit shapes it
 * (`{ in: 'body', path: '', code: 'custom' }`).
 *
 * @param {z.RefinementCtx} context - The refinement context of the body schema.
 * @param {{ readonly spaceId?: string | undefined; readonly listId?: string | undefined; readonly taskKey?: string | undefined }} body
 * - The parsed body.
 */
export function refuseTargetCount(
  context: z.RefinementCtx,
  body: {
    readonly spaceId?: string | undefined;
    readonly listId?: string | undefined;
    readonly taskKey?: string | undefined;
  },
): void {
  const named: number = [body.spaceId, body.listId, body.taskKey].filter(
    (target: string | undefined): boolean => target !== undefined,
  ).length;
  if (named !== 1) {
    context.addIssue({
      code: 'custom',
      path: [],
      message: 'Expected exactly one of spaceId, listId and taskKey',
    });
  }
}
