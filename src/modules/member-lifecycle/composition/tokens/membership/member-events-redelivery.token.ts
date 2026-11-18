/**
 * Constant MEMBER_EVENTS_REDELIVERY
 *
 * @description
 * Identifies the redelivery schedule (`EventRedelivery` of `@cadenway/nest-messaging`) of the three
 * member event consumers: `memberEventsRedeliveryProvider` binds the production schedule, and a
 * test can replace it with short delays.
 *
 * @type {unique symbol}
 */
export const MEMBER_EVENTS_REDELIVERY: unique symbol = Symbol('MemberEventsRedelivery');
