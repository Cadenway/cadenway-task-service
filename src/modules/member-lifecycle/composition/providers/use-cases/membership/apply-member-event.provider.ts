import type { FactoryProvider } from '@nestjs/common';

import type { MembershipCopy } from '../../../../application/ports/outbound/members/membership/membership-copy.port.js';
import type { PrivateSpaceHandover } from '../../../../application/ports/outbound/spaces/space/private-space-handover.port.js';
import type { MemberEventUnitOfWork } from '../../../../application/ports/outbound/transactions/membership/member-event-unit-of-work.port.js';
import { ApplyMemberEvent } from '../../../../application/use-cases/commands/membership/apply-member-event/apply-member-event.use-case.js';
import { MEMBER_EVENT_UNIT_OF_WORK } from '../../../tokens/membership/member-event-unit-of-work.token.js';
import { MEMBERSHIP_COPY } from '../../../tokens/membership/membership-copy.token.js';
import { PRIVATE_SPACE_HANDOVER } from '../../../tokens/space/private-space-handover.token.js';

/**
 * Constant applyMemberEventProvider
 *
 * @description
 * Builds the use case of the member event handlers on the copy of the memberships, the handover
 * of the spaces awaiting an owner and the unit of work that enqueues the clean-up job of a removed
 * member, which all join the tenant transaction the deduplicator of the kit opened for the
 * organization of the event.
 *
 * @type {FactoryProvider<ApplyMemberEvent>}
 */
export const applyMemberEventProvider: FactoryProvider<ApplyMemberEvent> = {
  provide: ApplyMemberEvent,
  inject: [MEMBER_EVENT_UNIT_OF_WORK, MEMBERSHIP_COPY, PRIVATE_SPACE_HANDOVER],
  useFactory: (
    unitOfWork: MemberEventUnitOfWork,
    memberships: MembershipCopy,
    spaces: PrivateSpaceHandover,
  ): ApplyMemberEvent => new ApplyMemberEvent(unitOfWork, memberships, spaces),
};
