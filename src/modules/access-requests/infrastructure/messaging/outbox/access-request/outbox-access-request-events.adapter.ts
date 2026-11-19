import { eventSchemas } from '@cadenway/contracts/events/task-service';
import type { TransactionScope } from '@cadenway/nest-common/database';
import type { OutboxWriter } from '@cadenway/nest-messaging/outbox';

import type { RequestedTarget } from '../../../../application/models/access-request/requested-target.model.js';
import type { AccessRequestEvents } from '../../../../application/ports/outbound/messaging/access-request/access-request-events.port.js';
import type { AccessRequest } from '../../../../domain/aggregates/access-request/access-request.aggregate.js';
import type { AccessRequestState } from '../../../../domain/value-objects/access-request/access-request-state.value-object.js';
import type { RequestActor } from '../../../../domain/value-objects/access-request/request-actor.value-object.js';
import type { RequestPlacement } from '../../../../domain/value-objects/access-request/request-placement.value-object.js';

/**
 * Function requireList
 *
 * @description
 * The list of a list or a task request, which the events of those targets carry.
 *
 * @param {string | null} listId - The stored list.
 * @returns {string} The same list.
 * @throws {Error} When the request has none, which the domain prevents.
 */
function requireList(listId: string | null): string {
  if (listId === null) {
    throw new Error('A list or task access request has no list.');
  }
  return listId;
}

/**
 * Function requireName
 *
 * @description
 * A name a `…access-requested.v1` event carries for its target.
 *
 * @param {string | null} name - The name read from the other module.
 * @returns {string} The same name.
 * @throws {Error} When it is missing, a defect of the caller.
 */
function requireName(name: string | null): string {
  if (name === null) {
    throw new Error('An access request event is missing a name of its target.');
  }
  return name;
}

/**
 * Class OutboxAccessRequestEvents
 *
 * @description
 * `AccessRequestEvents` on the outbox of `@cadenway/nest-messaging`, in the tenant transaction of
 * its unit of work: each payload is validated with the schemas of
 * `@cadenway/contracts/events/task-service` before its row is written, and PostgreSQL assigns the
 * event id and instant. The six events are `space|list|task.access-requested.v1`, at version 1,
 * by the requester, with the names of the target, the owner of its space and the message, and
 * `space|list|task.access-request-decided.v1`, at version 2, by who answered, with the decision
 * and the role, and no name. A task is named by its key. `organizationId` is the one of the
 * tenant transaction: row-level security refuses a row of another. The relay publishes the rows
 * once the transaction commits, so a rolled-back request emits nothing.
 */
export class OutboxAccessRequestEvents implements AccessRequestEvents {
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
   * Method accessRequested
   *
   * @description
   * Appends the `…access-requested.v1` of the target of a stored request.
   *
   * @param {AccessRequest} request - The stored request.
   * @param {RequestedTarget} target - The names of its target and the owner of its space.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {Error} When the payload does not match the schema of the contract: a defect, which
   * rolls the transaction back.
   */
  public async accessRequested(request: AccessRequest, target: RequestedTarget): Promise<void> {
    const state: AccessRequestState = request.snapshot;
    const common = {
      organizationId: state.organizationId,
      actor: { type: 'user', id: state.requesterUserId } as const,
      version: request.version,
      accessRequestId: state.id,
      spaceId: state.spaceId,
      spaceName: target.spaceName,
      requesterUserId: state.requesterUserId,
      spaceOwnerUserId: target.spaceOwnerUserId,
      message: state.message,
    };
    switch (state.target) {
      case 'space':
        await this.outbox.append(
          this.transaction,
          eventSchemas,
          'space.access-requested.v1',
          common,
        );
        break;
      case 'list':
        await this.outbox.append(this.transaction, eventSchemas, 'list.access-requested.v1', {
          ...common,
          listId: requireList(state.listId),
          listName: requireName(target.listName),
        });
        break;
      case 'task':
        await this.outbox.append(this.transaction, eventSchemas, 'task.access-requested.v1', {
          ...common,
          listId: requireList(state.listId),
          listName: requireName(target.listName),
          key: requireName(state.taskKey),
          name: requireName(target.taskName),
        });
        break;
    }
    this.onAppend();
  }

  /**
   * Method accessRequestDecided
   *
   * @description
   * Appends the `…access-request-decided.v1` of the target of an answered request, with the space
   * and the list where the target is now: for a task request, the current list of the task, on
   * which the approval gave its role ("the role an approval gave on the list of the task").
   *
   * @param {AccessRequest} request - The request, answered.
   * @param {RequestPlacement} placement - Where its target is now.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {Error} When the request is still pending, or the payload does not match the schema of
   * the contract: a defect, which rolls the transaction back.
   */
  public async accessRequestDecided(
    request: AccessRequest,
    placement: RequestPlacement,
  ): Promise<void> {
    const state: AccessRequestState = request.snapshot;
    const actor: RequestActor | null = state.decidedBy;
    if (actor === null) {
      throw new Error('A pending access request has no decision to announce.');
    }
    const common = {
      organizationId: state.organizationId,
      actor: { type: actor.type, id: actor.id },
      version: request.version,
      accessRequestId: state.id,
      spaceId: placement.spaceId,
      requesterUserId: state.requesterUserId,
      decision: state.status,
      role: state.role,
    };
    switch (state.target) {
      case 'space':
        await this.outbox.append(
          this.transaction,
          eventSchemas,
          'space.access-request-decided.v1',
          common,
        );
        break;
      case 'list':
        await this.outbox.append(this.transaction, eventSchemas, 'list.access-request-decided.v1', {
          ...common,
          listId: requireList(placement.listId),
        });
        break;
      case 'task':
        await this.outbox.append(this.transaction, eventSchemas, 'task.access-request-decided.v1', {
          ...common,
          listId: requireList(placement.listId),
          key: requireName(state.taskKey),
        });
        break;
    }
    this.onAppend();
  }
  // #endregion
}
