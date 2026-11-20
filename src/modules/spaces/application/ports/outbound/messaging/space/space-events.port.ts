import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { GrantEntry } from '../../../../../domain/value-objects/access/grant-entry.value-object.js';
import type { TaskListField } from '../../../../../domain/value-objects/list/task-list-field.value-object.js';
import type { SpaceField } from '../../../../../domain/value-objects/space/space-field.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';

/**
 * Interface SpaceEvents
 *
 * @description
 * The events of the spaces and their lists (`asyncapi/task-service.yaml`), appended to the outbox
 * in the transaction of the change: they leave once it commits, or never.
 */
export interface SpaceEvents {
  // #region Methods
  /**
   * Method spaceCreated
   *
   * @description
   * Appends `space.created.v1`, the whole space at its version 1.
   *
   * @param {Space} space - The stored space.
   * @param {EventActor} actor - Its creator.
   * @returns {Promise<void>} Resolves once appended.
   */
  spaceCreated(space: Space, actor: EventActor): Promise<void>;

  /**
   * Method spaceUpdated
   *
   * @description
   * Appends `space.updated.v1`, the whole space after the change and what changed.
   *
   * @param {Space} space - The space after the change.
   * @param {readonly SpaceField[]} changed - The fields that changed, at least one.
   * @param {EventActor} actor - Who changed it.
   * @returns {Promise<void>} Resolves once appended.
   */
  spaceUpdated(space: Space, changed: readonly SpaceField[], actor: EventActor): Promise<void>;

  /**
   * Method listCreated
   *
   * @description
   * Appends `list.created.v1`, the whole list at its version 1.
   *
   * @param {TaskList} list - The stored list.
   * @param {EventActor} actor - Its creator.
   * @returns {Promise<void>} Resolves once appended.
   */
  listCreated(list: TaskList, actor: EventActor): Promise<void>;

  /**
   * Method listUpdated
   *
   * @description
   * Appends `list.updated.v1`, the whole list after the change and what changed.
   *
   * @param {TaskList} list - The list after the change.
   * @param {readonly TaskListField[]} changed - The fields that changed, at least one.
   * @param {EventActor} actor - Who changed it.
   * @returns {Promise<void>} Resolves once appended.
   */
  listUpdated(list: TaskList, changed: readonly TaskListField[], actor: EventActor): Promise<void>;

  /**
   * Method listArchived
   *
   * @description
   * Appends `list.archived.v1`, the whole list after the archive, its switch "Accès de
   * l’organisation" included; its `occurredAt` is the `archivedAt` of the list.
   *
   * @param {TaskList} list - The list at its version after the archive.
   * @param {EventActor} actor - Who archived it.
   * @returns {Promise<void>} Resolves once appended.
   */
  listArchived(list: TaskList, actor: EventActor): Promise<void>;

  /**
   * Method listUnarchived
   *
   * @description
   * Appends `list.unarchived.v1`, the whole list after the restoration, its switch "Accès de
   * l’organisation" included.
   *
   * @param {TaskList} list - The list at its version after the restoration.
   * @param {EventActor} actor - Who restored it, the list or a task of it.
   * @returns {Promise<void>} Resolves once appended.
   */
  listUnarchived(list: TaskList, actor: EventActor): Promise<void>;

  /**
   * Method spaceAccessChanged
   *
   * @description
   * Appends `space.access-changed.v1`: every grant of the space after the change, in the order
   * they were first given, the people whose grant changed, and the version of the space.
   *
   * @param {Space} space - The space at its version after the change.
   * @param {readonly GrantEntry[]} grants - Every grant of the space after the change.
   * @param {readonly string[]} changedUserIds - The people whose grant changed, at least one.
   * @param {EventActor} actor - Who changed it: a member, or task-service.
   * @returns {Promise<void>} Resolves once appended.
   */
  spaceAccessChanged(
    space: Space,
    grants: readonly GrantEntry[],
    changedUserIds: readonly string[],
    actor: EventActor,
  ): Promise<void>;

  /**
   * Method listAccessChanged
   *
   * @description
   * Appends `list.access-changed.v1`: every grant and the switch "Accès de l’organisation" of the
   * list after the change, what changed (`grants`, `organizationAccess`), the people whose grant
   * changed (none when only the switch did), and the version of the list.
   *
   * @param {TaskList} list - The list at its version after the change.
   * @param {readonly GrantEntry[]} grants - Every grant of the list after the change.
   * @param {readonly ('grants' | 'organizationAccess')[]} changed - What changed, at least one.
   * @param {readonly string[]} changedUserIds - The people whose grant changed.
   * @param {EventActor} actor - Who changed it: a member, or task-service.
   * @returns {Promise<void>} Resolves once appended.
   */
  listAccessChanged(
    list: TaskList,
    grants: readonly GrantEntry[],
    changed: readonly ('grants' | 'organizationAccess')[],
    changedUserIds: readonly string[],
    actor: EventActor,
  ): Promise<void>;

  /**
   * Method spaceDeleted
   *
   * @description
   * Appends `space.deleted.v1`: the space and its version after the deletion, once for the space
   * and all its lists (none of them emits `list.deleted.v1`).
   *
   * @param {Space} space - The tombstone at its version after the deletion.
   * @param {EventActor} actor - Who deleted it.
   * @returns {Promise<void>} Resolves once appended.
   */
  spaceDeleted(space: Space, actor: EventActor): Promise<void>;

  /**
   * Method spaceRestored
   *
   * @description
   * Appends `space.restored.v1`, the whole space after it came back from the trash, as
   * `space.updated.v1` carries it, without `changed`.
   *
   * @param {Space} space - The space at its version after the restoration.
   * @param {EventActor} actor - Who restored the task that brought it back.
   * @returns {Promise<void>} Resolves once appended.
   */
  spaceRestored(space: Space, actor: EventActor): Promise<void>;

  /**
   * Method listDeleted
   *
   * @description
   * Appends `list.deleted.v1`: the list, its space and its version after a deletion on its own.
   *
   * @param {TaskList} list - The tombstone at its version after the deletion.
   * @param {EventActor} actor - Who deleted it.
   * @returns {Promise<void>} Resolves once appended.
   */
  listDeleted(list: TaskList, actor: EventActor): Promise<void>;

  /**
   * Method listRestored
   *
   * @description
   * Appends `list.restored.v1`, the whole list after it came back from the trash, its switch
   * "Accès de l’organisation" included.
   *
   * @param {TaskList} list - The list at its version after the restoration.
   * @param {EventActor} actor - Who restored the task that brought it back.
   * @returns {Promise<void>} Resolves once appended.
   */
  listRestored(list: TaskList, actor: EventActor): Promise<void>;
  // #endregion
}
