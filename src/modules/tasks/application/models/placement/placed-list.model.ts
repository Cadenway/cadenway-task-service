import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';
import type { TaskActor } from '../../../domain/value-objects/task/task-actor.value-object.js';

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

  /**
   * The instant that places the list in the order of its space (the sidebar and the overview,
   * `id` breaking the ties): its last restoration from the archives, else its creation ("Lists"
   * of `openapi/public/archives.yaml`: a restored list goes to the end of its space). It never
   * leaves the service.
   */
  readonly position: Date;

  /** Version of the list. */
  readonly version: number;

  /** The switch "Accès de l’organisation" of the list. */
  readonly organizationAccess: boolean;

  /**
   * When the list was archived, `null` for a live list: an archived list is left out of the lists
   * of its space, of the overview and of "Accueil", and reads by its id ("Lists" of
   * `openapi/public/archives.yaml`).
   */
  readonly archivedAt: Date | null;

  /** Who archived the list, `null` for a live list. */
  readonly archivedBy: TaskActor | null;

  /** The role of the actor on the list: any role reads its tasks, `edit` changes them. */
  readonly callerRole: AccessRole;
  // #endregion
}
