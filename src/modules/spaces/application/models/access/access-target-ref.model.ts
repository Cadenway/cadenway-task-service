/**
 * Type AccessTargetRef
 *
 * @description
 * A space or a list named by its id, as an access request names its target (decision 4 of P3b-1);
 * a task target is named by its list, whose grant it asks for.
 *
 * @type {{ readonly kind: 'space'; readonly spaceId: string } | { readonly kind: 'list'; readonly listId: string }}
 */
export type AccessTargetRef =
  | { readonly kind: 'space'; readonly spaceId: string }
  | { readonly kind: 'list'; readonly listId: string };
