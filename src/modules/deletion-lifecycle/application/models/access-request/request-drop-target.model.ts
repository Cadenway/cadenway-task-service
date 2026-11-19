/**
 * Type RequestDropTarget
 *
 * @description
 * What the deletion jobs drop the pending access requests of: tasks in the trash or erased (any
 * number), a deleted list (its list requests), or a deleted space (its space requests only; the
 * requests of its lists go with each list).
 *
 * @type {{ readonly kind: 'tasks'; readonly taskIds: readonly string[] } | { readonly kind: 'list'; readonly listId: string } | { readonly kind: 'space'; readonly spaceId: string }}
 */
export type RequestDropTarget =
  | { readonly kind: 'tasks'; readonly taskIds: readonly string[] }
  | { readonly kind: 'list'; readonly listId: string }
  | { readonly kind: 'space'; readonly spaceId: string };
