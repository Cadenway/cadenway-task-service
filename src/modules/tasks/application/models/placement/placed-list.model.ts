import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';

/**
 * Interface PlacedList
 *
 * @description
 * A list the actor has a role on, as the spaces module answers it, with that role.
 */
export interface PlacedList {
  // #region Properties
  /** Id of the list. */
  readonly id: string;

  /** The space of the list. */
  readonly spaceId: string;

  /** Name of the list. */
  readonly name: string;

  /** Icon of the list, if any. */
  readonly icon: string | null;

  /** Color of the list. */
  readonly color: string;

  /** The sprint dates and goal, `null` for a plain list. */
  readonly sprint: {
    readonly startDate: string;
    readonly endDate: string;
    readonly goal: string | null;
  } | null;

  /** When the list was created. */
  readonly createdAt: Date;

  /** Version of the list. */
  readonly version: number;

  /** The switch "Accès de l’organisation" of the list. */
  readonly organizationAccess: boolean;

  /** The role of the actor on the list: any role reads its tasks, `edit` changes them. */
  readonly callerRole: AccessRole;
  // #endregion
}
