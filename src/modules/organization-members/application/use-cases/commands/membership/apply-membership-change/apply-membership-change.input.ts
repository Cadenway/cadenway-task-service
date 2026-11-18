import type { MembershipChange } from '../../../../../domain/value-objects/membership/membership-change.value-object.js';

/**
 * Type ApplyMembershipChangeInput
 *
 * @description
 * One member event, validated against its AsyncAPI schema by the consumer of the kit and mapped
 * by the handler; `organizationId` is the organization of the event envelope, the one the
 * deduplicator opened the tenant transaction for.
 *
 * @type {MembershipChange}
 */
export type ApplyMembershipChangeInput = MembershipChange;
