import { EventConsumers } from '@cadenway/nest-messaging';
import type { EventRedelivery } from '@cadenway/nest-messaging';
import type { FactoryProvider } from '@nestjs/common';

import { ApplyMemberEvent } from '../../../../application/use-cases/commands/membership/apply-member-event/apply-member-event.use-case.js';
import { MemberEventsHandler } from '../../../../presentation/messaging/handlers/membership/member-events.handler.js';
import { MEMBER_EVENTS_REDELIVERY } from '../../../tokens/membership/member-events-redelivery.token.js';

/**
 * Constant memberEventsHandlerProvider
 *
 * @description
 * Builds the handler of the three member events on the durable consumers of the kit, the use case
 * of the member lifecycle and the redelivery schedule bound to `MEMBER_EVENTS_REDELIVERY`.
 *
 * @type {FactoryProvider<MemberEventsHandler>}
 */
export const memberEventsHandlerProvider: FactoryProvider<MemberEventsHandler> = {
  provide: MemberEventsHandler,
  inject: [EventConsumers, ApplyMemberEvent, MEMBER_EVENTS_REDELIVERY],
  useFactory: (
    consumers: EventConsumers,
    applyMemberEvent: ApplyMemberEvent,
    redelivery: EventRedelivery,
  ): MemberEventsHandler => new MemberEventsHandler(consumers, applyMemberEvent, redelivery),
};
