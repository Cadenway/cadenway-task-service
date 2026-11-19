/**
 * Type RestoreArchivedListOutput
 *
 * @description
 * What a restoration of the list of an archived task did:
 *
 * - `restored`: the list was archived; it is back at the end of its space, at its next version,
 *   and `list.unarchived.v1` was appended;
 * - `not-archived`: the list was live; nothing was written;
 * - `not-found`: the list does not exist, or the member has no role on it; nothing was written;
 * - `role-insufficient`: the member has `role` on the list, without `edit`; nothing was written.
 *
 * @type {object}
 */
export type RestoreArchivedListOutput =
  | { readonly outcome: 'restored' }
  | { readonly outcome: 'not-archived' }
  | { readonly outcome: 'not-found' }
  | { readonly outcome: 'role-insufficient'; readonly role: 'edit' | 'comment' | 'view' };
