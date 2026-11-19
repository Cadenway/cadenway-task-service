import type {
  AccessTarget,
  FindAccessTarget,
} from '../../../../spaces/public/access/find-access-target.js';
import type {
  GrantRequestedAccess,
  GrantRequestedAccessOutput,
} from '../../../../spaces/public/access/grant-requested-access.js';
import type {
  ListManagedAccessTargets,
  ListManagedAccessTargetsOutput,
} from '../../../../spaces/public/access/list-managed-access-targets.js';
import type { GrantOutcome } from '../../../application/models/grant/grant-outcome.model.js';
import type { GrantRequest } from '../../../application/models/grant/grant-request.model.js';
import type { ManagedTargets } from '../../../application/models/target/managed-targets.model.js';
import type { TargetAccess } from '../../../application/models/target/target-access.model.js';
import type { TargetRef } from '../../../application/models/target/target-ref.model.js';
import type { AccessTargets } from '../../../application/ports/outbound/spaces/access/access-targets.port.js';
import type { MemberRole } from '../../../domain/value-objects/member/member-role.value-object.js';

/**
 * Class SpacesAccessTargets
 *
 * @description
 * `AccessTargets` on the public operations of the spaces module: `FindAccessTarget` (a space or a
 * list with the access of a member, without lock), `ListManagedAccessTargets` (what a member
 * answers for) and `GrantRequestedAccess` (the grant of an approval, which raises and never
 * lowers, bumps the version and appends the access change). Each joins the tenant transaction of
 * the calling use case.
 */
export class SpacesAccessTargets implements AccessTargets {
  // #region Properties
  /**
   * Property findAccessTarget
   *
   * @description
   * The reading of a space or a list with the access of a member.
   *
   * @type {FindAccessTarget}
   * @readonly
   */
  private readonly findAccessTarget: FindAccessTarget;

  /**
   * Property listManagedAccessTargets
   *
   * @description
   * The reading of what a member answers for.
   *
   * @type {ListManagedAccessTargets}
   * @readonly
   */
  private readonly listManagedAccessTargets: ListManagedAccessTargets;

  /**
   * Property grantRequestedAccess
   *
   * @description
   * The grant of an approval.
   *
   * @type {GrantRequestedAccess}
   * @readonly
   */
  private readonly grantRequestedAccess: GrantRequestedAccess;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the three public operations of the spaces module.
   *
   * @param {FindAccessTarget} findAccessTarget - The reading of a target.
   * @param {ListManagedAccessTargets} listManagedAccessTargets - The reading of what a member
   * answers for.
   * @param {GrantRequestedAccess} grantRequestedAccess - The grant of an approval.
   * @constructor
   */
  public constructor(
    findAccessTarget: FindAccessTarget,
    listManagedAccessTargets: ListManagedAccessTargets,
    grantRequestedAccess: GrantRequestedAccess,
  ) {
    this.findAccessTarget = findAccessTarget;
    this.listManagedAccessTargets = listManagedAccessTargets;
    this.grantRequestedAccess = grantRequestedAccess;
  }
  // #endregion

  // #region Methods
  /**
   * Method find
   *
   * @description
   * Runs `FindAccessTarget` for the member.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} viewerUserId - The account of the member.
   * @param {MemberRole} viewerRole - Its role in the organization.
   * @param {TargetRef} target - The space or the list.
   * @returns {Promise<TargetAccess | null>} The target, or `null`.
   */
  public async find(
    organizationId: string,
    viewerUserId: string,
    viewerRole: MemberRole,
    target: TargetRef,
  ): Promise<TargetAccess | null> {
    const found: AccessTarget | null = await this.findAccessTarget.execute({
      organizationId,
      viewerUserId,
      viewerRole,
      target,
    });
    return found === null
      ? null
      : {
          kind: found.kind,
          spaceId: found.spaceId,
          spaceName: found.spaceName,
          spaceOwnerUserId: found.spaceOwnerUserId,
          listId: found.listId,
          listName: found.listName,
          viewerRole: found.viewerRole,
          viewerManages: found.viewerManages,
        };
  }

  /**
   * Method listManaged
   *
   * @description
   * Runs `ListManagedAccessTargets` for the member.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} viewerUserId - The account of the member.
   * @param {MemberRole} viewerRole - Its role in the organization.
   * @returns {Promise<ManagedTargets>} The spaces and the lists.
   */
  public async listManaged(
    organizationId: string,
    viewerUserId: string,
    viewerRole: MemberRole,
  ): Promise<ManagedTargets> {
    const managed: ListManagedAccessTargetsOutput = await this.listManagedAccessTargets.execute({
      organizationId,
      viewerUserId,
      viewerRole,
    });
    return { spaceIds: managed.spaceIds, listIds: managed.listIds };
  }

  /**
   * Method grant
   *
   * @description
   * Runs `GrantRequestedAccess` for the approval.
   *
   * @param {GrantRequest} request - The grant.
   * @returns {Promise<GrantOutcome>} What was done, or the rule that refused it.
   */
  public async grant(request: GrantRequest): Promise<GrantOutcome> {
    const outcome: GrantRequestedAccessOutput = await this.grantRequestedAccess.execute({
      organizationId: request.organizationId,
      actorUserId: request.actorUserId,
      target: request.target,
      granteeUserId: request.granteeUserId,
      role: request.role,
    });
    return outcome.outcome === 'granted'
      ? { outcome: 'granted', changed: outcome.changed }
      : { outcome: 'refused', reason: outcome.reason };
  }
  // #endregion
}
