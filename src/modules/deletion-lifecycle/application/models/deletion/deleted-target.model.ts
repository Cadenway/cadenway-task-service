/**
 * Type DeletedTarget
 *
 * @description
 * What a person deleted, whose tasks the deletion job moves to the trash: a list
 * (`deleteListInternal`), or a space with all its lists (`deleteSpaceInternal`), as the payload of
 * a `task.trash-deleted-tasks` job names it.
 *
 * @type {{ readonly kind: 'list'; readonly listId: string } | { readonly kind: 'space'; readonly spaceId: string }}
 */
export type DeletedTarget =
  | { readonly kind: 'list'; readonly listId: string }
  | { readonly kind: 'space'; readonly spaceId: string };
