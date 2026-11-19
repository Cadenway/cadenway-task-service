import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';

/**
 * Type ListRestoration
 *
 * @description
 * What the spaces module answers when the restoration of a task brings its archived list back
 * ("Restoring any task of an archive restores the whole archive, from its root, to its list, which
 * is restored too when it is archived", "Tasks" of `openapi/public/archives.yaml`): `restored`
 * (it appended `list.unarchived.v1`), `not-archived` (the list is live, nothing written),
 * `not-found` (unknown, or the actor has no role on it) or `role-insufficient` with the role of
 * the actor on the list, who needs `edit`. A refusal writes nothing.
 *
 * @type {{ readonly outcome: 'restored' } | { readonly outcome: 'not-archived' } | { readonly outcome: 'not-found' } | { readonly outcome: 'role-insufficient'; readonly role: AccessRole }}
 */
export type ListRestoration =
  | { readonly outcome: 'restored' }
  | { readonly outcome: 'not-archived' }
  | { readonly outcome: 'not-found' }
  | { readonly outcome: 'role-insufficient'; readonly role: AccessRole };
