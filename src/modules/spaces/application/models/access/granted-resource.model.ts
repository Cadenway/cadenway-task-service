/**
 * Type GrantedResource
 *
 * @description
 * The space or the list a grant opens, as the grant tables store it: a grant of a list repeats the
 * space of the list (`list_grants.space_id`), which never changes in this version.
 *
 * @type {{ readonly kind: 'space'; readonly spaceId: string } | { readonly kind: 'list'; readonly spaceId: string; readonly listId: string }}
 */
export type GrantedResource =
  | { readonly kind: 'space'; readonly spaceId: string }
  | { readonly kind: 'list'; readonly spaceId: string; readonly listId: string };
