/**
 * Type RestoreDeletedListOutput
 *
 * @description
 * What the restoration of the list of a trash entry did:
 *
 * - `restored`: the member has `edit` on the list as if not deleted; `spaceRestored` when its
 *   space was deleted and came back at the end of the sidebar (`space.restored.v1` appended),
 *   `listRestored` when the list was deleted and came back at the end of its space
 *   (`list.restored.v1` appended after it); both `false` for a live list in a live space, an
 *   archived one included, which stays as it is and writes nothing;
 * - `not-found`: the list is unknown or erased, or the member would have no role on it; nothing
 *   was written;
 * - `role-insufficient`: the member would have `role` on the list, without `edit`; nothing was
 *   written.
 *
 * @type {object}
 */
export type RestoreDeletedListOutput =
  | {
      readonly outcome: 'restored';
      readonly listRestored: boolean;
      readonly spaceRestored: boolean;
    }
  | { readonly outcome: 'not-found' }
  | { readonly outcome: 'role-insufficient'; readonly role: 'edit' | 'comment' | 'view' };
