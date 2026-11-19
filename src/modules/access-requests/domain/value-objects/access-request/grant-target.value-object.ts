/**
 * Type GrantTarget
 *
 * @description
 * What an approval grants: the space of a space request, the list of a list request, and the list
 * of a task request, the list the task was in when it was asked for ("Access requests" of
 * `openapi/public/access.yaml`: "the grant of its list for a task"; decision beyond the brief of the
 * contract: "a task request is approved as a grant of its list").
 *
 * @type {{ readonly kind: 'space'; readonly spaceId: string } | { readonly kind: 'list'; readonly listId: string }}
 */
export type GrantTarget =
  | { readonly kind: 'space'; readonly spaceId: string }
  | { readonly kind: 'list'; readonly listId: string };
