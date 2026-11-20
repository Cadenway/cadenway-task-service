/**
 * Type RequestDropTarget
 *
 * @description
 * What the deletion jobs drop the pending access requests of: tasks in the trash or erased (any
 * number), a deleted or erased list (its list requests), or a deleted or erased space (its space
 * requests and the list requests of its lists).
 *
 * @type {{ readonly kind: 'tasks'; readonly taskIds: readonly string[] } | { readonly kind: 'list'; readonly listId: string } | { readonly kind: 'space'; readonly spaceId: string }}
 */
export type RequestDropTarget =
  | { readonly kind: 'tasks'; readonly taskIds: readonly string[] }
  | { readonly kind: 'list'; readonly listId: string }
  | { readonly kind: 'space'; readonly spaceId: string };
