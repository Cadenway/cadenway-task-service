/**
 * Type RequestedTargetRef
 *
 * @description
 * The one target a request for access names, as the link the requester followed names it
 * (`AccessRequestCreation` of `openapi/internal/task-service.yaml`): a space or a list by its id, a
 * task by its key.
 *
 * @type {{ readonly kind: 'space'; readonly spaceId: string } | { readonly kind: 'list'; readonly listId: string } | { readonly kind: 'task'; readonly taskKey: string }}
 */
export type RequestedTargetRef =
  | { readonly kind: 'space'; readonly spaceId: string }
  | { readonly kind: 'list'; readonly listId: string }
  | { readonly kind: 'task'; readonly taskKey: string };
