import type { SpaceEvents } from '../../ports/outbound/messaging/space/space-events.port.js';
import type { TaskListRepository } from '../../ports/outbound/persistence/list/task-list-repository.port.js';
import type { SpacePrefixRepository } from '../../ports/outbound/persistence/space/space-prefix-repository.port.js';
import type { SpaceRepository } from '../../ports/outbound/persistence/space/space-repository.port.js';

/**
 * Interface SpacesStore
 *
 * @description
 * The repositories and the events of the spaces module, all bound to the tenant transaction of one
 * unit of work: what they write commits together, or not at all.
 */
export interface SpacesStore {
  // #region Properties
  /**
   * Property spaces
   *
   * @description
   * The spaces.
   *
   * @type {SpaceRepository}
   * @readonly
   */
  readonly spaces: SpaceRepository;

  /**
   * Property prefixes
   *
   * @description
   * The prefixes and their task counters.
   *
   * @type {SpacePrefixRepository}
   * @readonly
   */
  readonly prefixes: SpacePrefixRepository;

  /**
   * Property lists
   *
   * @description
   * The lists and sprints.
   *
   * @type {TaskListRepository}
   * @readonly
   */
  readonly lists: TaskListRepository;

  /**
   * Property events
   *
   * @description
   * The outbox of the transaction.
   *
   * @type {SpaceEvents}
   * @readonly
   */
  readonly events: SpaceEvents;
  // #endregion
}
