import type { StatusKey } from '../../../domain/value-objects/task/status-key.value-object.js';
import type { AccessRole } from './access-role.model.js';

/**
 * Interface PlacedSpace
 *
 * @description
 * A space the actor sees, as the spaces module answers it, with the statuses it uses, the key its
 * next task takes and the access of the actor to it.
 */
export interface PlacedSpace {
  // #region Properties
  /** Id of the space. */
  readonly id: string;

  /** Name of the space. */
  readonly name: string;

  /** Prefix of the keys of its new tasks. */
  readonly prefix: string;

  /** Description of the space, if any. */
  readonly description: string | null;

  /** Icon of the space, if any. */
  readonly icon: string | null;

  /** Color of the space. */
  readonly color: string;

  /** Who sees the space. */
  readonly visibility: 'organization' | 'private';

  /** The account that owns the space. */
  readonly ownerUserId: string;

  /** The name and the use of each of the ten statuses in the space. */
  readonly statuses: Readonly<
    Record<StatusKey, { readonly name: string | null; readonly hidden: boolean }>
  >;

  /** The key the next task would take, a preview. */
  readonly nextKey: string;

  /** When the space was created. */
  readonly createdAt: Date;

  /** Version of the space. */
  readonly version: number;

  /** The role of the actor on the space itself; `null` when they see it through some of its lists only. */
  readonly callerRole: AccessRole | null;

  /** Whether the actor manages the space (its visibility, its sharing, its deletion). */
  readonly callerCanManage: boolean;
  // #endregion
}
