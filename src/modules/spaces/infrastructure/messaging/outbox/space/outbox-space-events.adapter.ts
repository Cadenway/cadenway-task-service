import { eventSchemas } from '@cadenway/contracts/events/task-service';
import type { TransactionScope } from '@cadenway/nest-common/database';
import type { OutboxWriter } from '@cadenway/nest-messaging/outbox';

import type { EventActor } from '../../../../application/models/actor/event-actor.model.js';
import type { SpaceEvents } from '../../../../application/ports/outbound/messaging/space/space-events.port.js';
import type { TaskList } from '../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../domain/aggregates/space/space.aggregate.js';
import type { TaskListField } from '../../../../domain/value-objects/list/task-list-field.value-object.js';
import type { TaskListState } from '../../../../domain/value-objects/list/task-list-state.value-object.js';
import type { SpaceField } from '../../../../domain/value-objects/space/space-field.value-object.js';
import type { SpaceState } from '../../../../domain/value-objects/space/space-state.value-object.js';

/**
 * Class OutboxSpaceEvents
 *
 * @description
 * `SpaceEvents` on the outbox of `@cadenway/nest-messaging`, in the tenant transaction of its unit
 * of work: each payload is the whole space or list after the change, validated with the schemas of
 * `@cadenway/contracts/events/task-service` before its row is written, and PostgreSQL assigns the
 * event id and instant. `organizationId` is the organization of the aggregate, the one of the tenant
 * transaction: row-level security refuses a row of another. The relay publishes the rows once the
 * transaction commits, so a rolled-back change emits nothing.
 */
export class OutboxSpaceEvents implements SpaceEvents {
  // #region Properties
  /**
   * Property transaction
   *
   * @description
   * The tenant transaction the events are appended in.
   *
   * @type {TransactionScope}
   * @readonly
   */
  private readonly transaction: TransactionScope;

  /**
   * Property outbox
   *
   * @description
   * The outbox writer of the kit.
   *
   * @type {OutboxWriter}
   * @readonly
   */
  private readonly outbox: OutboxWriter;

  /**
   * Property onAppend
   *
   * @description
   * Called after each append, so the unit of work wakes the relay once it commits.
   *
   * @type {() => void}
   * @readonly
   */
  private readonly onAppend: () => void;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Binds the events to a transaction.
   *
   * @param {TransactionScope} transaction - The tenant transaction the events are appended in.
   * @param {OutboxWriter} outbox - The outbox writer of the kit.
   * @param {() => void} onAppend - Called after each append.
   * @constructor
   */
  public constructor(transaction: TransactionScope, outbox: OutboxWriter, onAppend: () => void) {
    this.transaction = transaction;
    this.outbox = outbox;
    this.onAppend = onAppend;
  }
  // #endregion

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
   * @throws {Error} When the payload does not match the schema of the contract: a defect, which
   * rolls the transaction back.
   */
  public async spaceCreated(space: Space, actor: EventActor): Promise<void> {
    const state: SpaceState = space.snapshot;
    await this.outbox.append(this.transaction, eventSchemas, 'space.created.v1', {
      organizationId: state.organizationId,
      actor: { type: actor.type, id: actor.id },
      version: state.version,
      spaceId: state.id,
      name: state.name,
      prefix: state.prefix,
      description: state.description,
      icon: state.icon,
      color: state.color,
      visibility: state.visibility,
      ownerUserId: state.ownerUserId,
      statuses: state.statuses,
    });
    this.onAppend();
  }

  /**
   * Method spaceUpdated
   *
   * @description
   * Appends `space.updated.v1`, the whole space after the change and the names of what changed.
   *
   * @param {Space} space - The space after the change.
   * @param {readonly SpaceField[]} changed - The fields that changed, at least one.
   * @param {EventActor} actor - Who changed it: a member, or task-service for a hand-over.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {Error} When the payload does not match the schema of the contract: a defect, which
   * rolls the transaction back.
   */
  public async spaceUpdated(
    space: Space,
    changed: readonly SpaceField[],
    actor: EventActor,
  ): Promise<void> {
    const state: SpaceState = space.snapshot;
    await this.outbox.append(this.transaction, eventSchemas, 'space.updated.v1', {
      organizationId: state.organizationId,
      actor: { type: actor.type, id: actor.id },
      version: state.version,
      spaceId: state.id,
      name: state.name,
      prefix: state.prefix,
      description: state.description,
      icon: state.icon,
      color: state.color,
      visibility: state.visibility,
      ownerUserId: state.ownerUserId,
      statuses: state.statuses,
      changed: [...changed],
    });
    this.onAppend();
  }

  /**
   * Method listCreated
   *
   * @description
   * Appends `list.created.v1`, the whole list at its version 1.
   *
   * @param {TaskList} list - The stored list.
   * @param {EventActor} actor - Its creator.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {Error} When the payload does not match the schema of the contract: a defect, which
   * rolls the transaction back.
   */
  public async listCreated(list: TaskList, actor: EventActor): Promise<void> {
    const state: TaskListState = list.snapshot;
    await this.outbox.append(this.transaction, eventSchemas, 'list.created.v1', {
      organizationId: state.organizationId,
      actor: { type: actor.type, id: actor.id },
      version: state.version,
      listId: state.id,
      spaceId: state.spaceId,
      name: state.name,
      icon: state.icon,
      color: state.color,
      sprint:
        state.sprint === null
          ? null
          : {
              startDate: state.sprint.startDate,
              endDate: state.sprint.endDate,
              goal: state.sprint.goal,
            },
    });
    this.onAppend();
  }

  /**
   * Method listUpdated
   *
   * @description
   * Appends `list.updated.v1`, the whole list after the change and the names of what changed.
   *
   * @param {TaskList} list - The list after the change.
   * @param {readonly TaskListField[]} changed - The fields that changed, at least one.
   * @param {EventActor} actor - Who changed it.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {Error} When the payload does not match the schema of the contract: a defect, which
   * rolls the transaction back.
   */
  public async listUpdated(
    list: TaskList,
    changed: readonly TaskListField[],
    actor: EventActor,
  ): Promise<void> {
    const state: TaskListState = list.snapshot;
    await this.outbox.append(this.transaction, eventSchemas, 'list.updated.v1', {
      organizationId: state.organizationId,
      actor: { type: actor.type, id: actor.id },
      version: state.version,
      listId: state.id,
      spaceId: state.spaceId,
      name: state.name,
      icon: state.icon,
      color: state.color,
      sprint:
        state.sprint === null
          ? null
          : {
              startDate: state.sprint.startDate,
              endDate: state.sprint.endDate,
              goal: state.sprint.goal,
            },
      changed: [...changed],
    });
    this.onAppend();
  }
  // #endregion
}
