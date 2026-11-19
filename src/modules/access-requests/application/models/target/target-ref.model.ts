/**
 * Type TargetRef
 *
 * @description
 * A space or a list named by its id, whose access this module reads or grants through the spaces
 * module: a task is named by its list.
 *
 * @type {{ readonly kind: 'space'; readonly spaceId: string } | { readonly kind: 'list'; readonly listId: string }}
 */
export type TargetRef =
  | { readonly kind: 'space'; readonly spaceId: string }
  | { readonly kind: 'list'; readonly listId: string };
