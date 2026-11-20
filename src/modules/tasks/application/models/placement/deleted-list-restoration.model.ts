import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';

/**
 * Type DeletedListRestoration
 *
 * @description
 * What the spaces module answers when the restoration of a trash entry hands it the list of the
 * entry (`RestoreDeletedList`): `restored`, with whether the list and its space were deleted and
 * came back with it (both `false` for a live list, nothing written); `not-found` for a list the
 * actor has no role on, as if not deleted, or an unknown one; `role-insufficient` with the role
 * they would have, without `edit`. A refusal writes nothing.
 */
export type DeletedListRestoration =
  | {
      readonly outcome: 'restored';
      readonly listRestored: boolean;
      readonly spaceRestored: boolean;
    }
  | { readonly outcome: 'not-found' }
  | { readonly outcome: 'role-insufficient'; readonly role: AccessRole };
