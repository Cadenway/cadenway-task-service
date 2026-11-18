import { eventSchemas } from '@cadenway/contracts/events/organization-service';
import type {
  MemberJoinedV1,
  MemberRemovedV1,
  MemberRoleChangedV1,
} from '@cadenway/contracts/events/organization-service';
import type { EventConsumers, EventContext, EventRedelivery } from '@cadenway/nest-messaging';
import { Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';

import type { ApplyMemberEventInput } from '../../../../application/use-cases/commands/membership/apply-member-event/apply-member-event.input.js';
import type { ApplyMemberEvent } from '../../../../application/use-cases/commands/membership/apply-member-event/apply-member-event.use-case.js';

/**
 * Function toChange
 *
 * @description
 * Maps a member event, validated against its AsyncAPI schema by the consumer of the kit, to the
 * input of the use case. The ids are lower-cased: the schema accepts a UUID in either case, and
 * PostgreSQL returns the stored ones in lower case, which the copy of the memberships compares with
 * the event and the spaces module compares with the owners of the spaces.
 *
 * @param {ApplyMemberEventInput['kind']} kind - Which event.
 * @param {MemberJoinedV1 | MemberRoleChangedV1 | MemberRemovedV1} payload - The payload.
 * @returns {ApplyMemberEventInput} The change to apply.
 */
function toChange(
  kind: ApplyMemberEventInput['kind'],
  payload: MemberJoinedV1 | MemberRoleChangedV1 | MemberRemovedV1,
): ApplyMemberEventInput {
  return {
    kind,
    memberId: payload.memberId.toLowerCase(),
    organizationId: payload.organizationId.toLowerCase(),
    userId: payload.userId.toLowerCase(),
    role: payload.role,
    version: payload.version,
    occurredAt: new Date(payload.occurredAt),
  };
}

/**
 * Class MemberEventsHandler
 *
 * @description
 * Subscribes the member lifecycle to `member.joined.v1`, `member.role-changed.v1` and
 * `member.removed.v1` (`asyncapi/organization-service.yaml`), one durable consumer of `EVENTS` per
 * event (`task-service__project-member-joined`, `task-service__project-member-role-changed`,
 * `task-service__project-member-removed`), each filtered on its subject. The handler names are the
 * ones the NATS grants of the `task` user allow (cadenway-ops): the broker refuses any other at
 * start-up, so they must not change.
 *
 * The consumers keep the default `deliverPolicy: 'all'`. The contract ("Memberships" in the
 * description of `asyncapi/organization-service.yaml`) requires a consumer that keeps a copy to
 * read the whole history of the events, not only those published after it subscribed: `'new'`
 * would miss every member who joined before the first deployment. Reading again is harmless: every
 * effect stays in this service's database and is idempotent (the copy orders the three subjects by
 * the version of the membership, a removal enqueues its clean-up job once per membership and
 * version), and each event id is applied once by the deduplicator of the kit.
 *
 * The deduplicator runs each delivery in the tenant transaction of the organization of its
 * envelope and records its event id there; `ApplyMemberEvent` joins it, so the copy, the clean-up
 * job of a removal (or the spaces an arriving owner takes, with their outbox rows) and the
 * processed id commit together. The ordering is
 * the copy's, not `claimVersion`'s, which keys versions per consumer while the three events travel
 * on separate consumers. A failure is retried on the schedule `MemberLifecycleModule` gives the
 * three consumers (about 25 h 43 min, `memberEventsRedeliveryProvider`), then kept as a dead
 * letter. Built by `memberEventsHandlerProvider`.
 */
export class MemberEventsHandler implements OnApplicationBootstrap {
  // #region Properties
  /**
   * Property logger
   *
   * @description
   * The logger of the handler, for the removals that fail.
   *
   * @type {Logger}
   * @readonly
   */
  private readonly logger: Logger = new Logger(MemberEventsHandler.name);

  /**
   * Property consumers
   *
   * @description
   * The durable consumers of the kit.
   *
   * @type {EventConsumers}
   * @readonly
   */
  private readonly consumers: EventConsumers;

  /**
   * Property applyMemberEvent
   *
   * @description
   * Use case of the member lifecycle.
   *
   * @type {ApplyMemberEvent}
   * @readonly
   */
  private readonly applyMemberEvent: ApplyMemberEvent;

  /**
   * Property redelivery
   *
   * @description
   * Redelivery schedule of the three consumers: the delays between the deliveries of a failing
   * event and the number of deliveries before its dead letter.
   *
   * @type {EventRedelivery}
   * @readonly
   */
  private readonly redelivery: EventRedelivery;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the consumers of the kit, the use case and the redelivery schedule, provided by
   * `MemberLifecycleModule`.
   *
   * @param {EventConsumers} consumers - The durable consumers of the kit.
   * @param {ApplyMemberEvent} applyMemberEvent - Use case of the member lifecycle.
   * @param {EventRedelivery} redelivery - Redelivery schedule of the three consumers.
   * @constructor
   */
  public constructor(
    consumers: EventConsumers,
    applyMemberEvent: ApplyMemberEvent,
    redelivery: EventRedelivery,
  ) {
    this.consumers = consumers;
    this.applyMemberEvent = applyMemberEvent;
    this.redelivery = redelivery;
  }
  // #endregion

  // #region Methods
  /**
   * Method onApplicationBootstrap
   *
   * @description
   * Registers the three subscriptions once the application has bootstrapped, each with the
   * redelivery schedule. The kit checks the schedule before any broker request and sets its
   * delivery limit on the durable consumer, updating an existing one in place.
   *
   * @returns {Promise<void>} Resolves once the three consumers are bound.
   * @throws {Error} When the kit refuses the schedule or the broker refuses a consumer: the
   * start-up fails.
   */
  public async onApplicationBootstrap(): Promise<void> {
    await this.consumers.subscribe({
      handler: 'project-member-joined',
      schemas: eventSchemas,
      event: 'member.joined.v1',
      redelivery: this.redelivery,
      handle: (payload: MemberJoinedV1): Promise<void> =>
        this.applyMemberEvent.execute(toChange('joined', payload)).then((): void => undefined),
    });
    await this.consumers.subscribe({
      handler: 'project-member-role-changed',
      schemas: eventSchemas,
      event: 'member.role-changed.v1',
      redelivery: this.redelivery,
      handle: (payload: MemberRoleChangedV1): Promise<void> =>
        this.applyMemberEvent
          .execute(toChange('role-changed', payload))
          .then((): void => undefined),
    });
    await this.consumers.subscribe({
      handler: 'project-member-removed',
      schemas: eventSchemas,
      event: 'member.removed.v1',
      redelivery: this.redelivery,
      handle: (payload: MemberRemovedV1, context: EventContext): Promise<void> =>
        this.applyRemoval(toChange('removed', payload), context.deliveryCount),
    });
  }

  /**
   * Method applyRemoval
   *
   * @description
   * Applies a removal: the copy and its clean-up job. A removal that fails is logged once per delivery, at `warn` (the kit redelivers it), with the
   * error under `err` (its message and its SQLSTATE or code survive the masking of the kit) and
   * the one-based number of the delivery, so an operator can tell a lock wait, a statement timeout
   * or a database error from the others and see how many times it came back. The error is then
   * thrown again unchanged: the transaction has rolled back and the kit retries on its schedule.
   * A delivery abandoned at the deadline of the handler never reaches the catch; the kit logs it.
   *
   * @param {ApplyMemberEventInput} change - The removal.
   * @param {number} deliveryCount - The one-based number of this delivery, from the kit.
   * @returns {Promise<void>} Resolves once applied.
   * @throws {Error} What the use case threw, after it was logged.
   */
  private async applyRemoval(change: ApplyMemberEventInput, deliveryCount: number): Promise<void> {
    try {
      await this.applyMemberEvent.execute(change);
    } catch (error: unknown) {
      this.logger.warn({ err: error, deliveryCount }, 'The removal of a member failed.');
      throw error;
    }
  }
  // #endregion
}
