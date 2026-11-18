/**
 * Interface ApplyMemberEventInput
 *
 * @description
 * One member event of organization-service (`member.joined.v1`, `member.role-changed.v1` or
 * `member.removed.v1` of `asyncapi/organization-service.yaml`), validated against its AsyncAPI
 * schema by the consumer of the kit and mapped by the handler, its ids in lower case.
 * `organizationId` is the organization of the event envelope, the one the deduplicator of the kit
 * opened the tenant transaction for.
 */
export interface ApplyMemberEventInput {
  // #region Properties
  /**
   * Property kind
   *
   * @description
   * Which event: the membership began, its role changed, or it ended.
   *
   * @type {'joined' | 'role-changed' | 'removed'}
   * @readonly
   */
  readonly kind: 'joined' | 'role-changed' | 'removed';

  /**
   * Property memberId
   *
   * @description
   * Id organization-service gave the membership, the aggregate its version orders.
   *
   * @type {string}
   * @readonly
   */
  readonly memberId: string;

  /**
   * Property organizationId
   *
   * @description
   * Organization of the membership, the organization of the event envelope.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property userId
   *
   * @description
   * Account of the member.
   *
   * @type {string}
   * @readonly
   */
  readonly userId: string;

  /**
   * Property role
   *
   * @description
   * Role after the change; for a removal, the role the member had.
   *
   * @type {'owner' | 'admin' | 'member' | 'guest'}
   * @readonly
   */
  readonly role: 'owner' | 'admin' | 'member' | 'guest';

  /**
   * Property version
   *
   * @description
   * Version of the membership after the change: 1 when it begins.
   *
   * @type {number}
   * @readonly
   */
  readonly version: number;

  /**
   * Property occurredAt
   *
   * @description
   * When organization-service committed the change.
   *
   * @type {Date}
   * @readonly
   */
  readonly occurredAt: Date;
  // #endregion
}
