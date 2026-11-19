/**
 * Type DroppedRequestTarget
 *
 * @description
 * What was deleted, whose pending access requests are dropped ("The pending requests of a target
 * that is deleted ... are dropped" of `openapi/public/access.yaml`):
 *
 * - `tasks`: tasks in the trash or erased, whose task requests go; 2,000 ids at most;
 * - `list`: a deleted list, whose list requests go (the requests for its tasks go with the tasks);
 * - `space`: a deleted space, whose space requests go (the list requests of its lists go with each
 *   list).
 *
 * @type {{ readonly kind: 'tasks'; readonly taskIds: readonly string[] } | { readonly kind: 'list'; readonly listId: string } | { readonly kind: 'space'; readonly spaceId: string }}
 */
export type DroppedRequestTarget =
  | { readonly kind: 'tasks'; readonly taskIds: readonly string[] }
  | { readonly kind: 'list'; readonly listId: string }
  | { readonly kind: 'space'; readonly spaceId: string };
