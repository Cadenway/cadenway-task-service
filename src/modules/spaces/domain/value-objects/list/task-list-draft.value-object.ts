import type { LookColor } from '../look/look-color.value-object.js';
import type { LookIcon } from '../look/look-icon.value-object.js';
import type { Sprint } from './sprint.value-object.js';

/**
 * Interface TaskListDraft
 *
 * @description
 * A checked and normalized new list or sprint, what a repository inserts: PostgreSQL assigns its
 * `id` and `createdAt`, and its version starts at 1. Every member already satisfies the invariants
 * of `TaskList` (`TaskList` of `openapi/internal/task-service.yaml`).
 */
export interface TaskListDraft {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * Organization of the list, the one of its space.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property spaceId
   *
   * @description
   * Space of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property name
   *
   * @description
   * "Nom", trimmed, 1 to 80 characters.
   *
   * @type {string}
   * @readonly
   */
  readonly name: string;

  /**
   * Property icon
   *
   * @description
   * Icon of the list; `null` for the default one ("Par défaut": its bullets, or the lightning for a
   * sprint).
   *
   * @type {LookIcon | null}
   * @readonly
   */
  readonly icon: LookIcon | null;

  /**
   * Property color
   *
   * @description
   * Color of the list.
   *
   * @type {LookColor}
   * @readonly
   */
  readonly color: LookColor;

  /**
   * Property sprint
   *
   * @description
   * The dates and the goal of a sprint; `null` for a list that is not a sprint.
   *
   * @type {Sprint | null}
   * @readonly
   */
  readonly sprint: Sprint | null;
  // #endregion
}
