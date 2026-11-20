import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { CustomFieldActor } from '../../models/custom-field/custom-field-actor.model.js';
import { CustomFieldRefusal } from '../../models/custom-field/custom-field-refusal.model.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';
import type { MemberDirectory } from '../../ports/outbound/members/membership/member-directory.port.js';
import type { CustomFieldSpacePort } from '../../ports/outbound/spaces/custom-field/custom-field-space.port.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';
import { ViewerResolver } from '../member/viewer-resolver.service.js';

/** Rechecks membership and space/list visibility inside a caller's transaction. */
export class CustomFieldAccess {
  // #region Properties
  /** State used by this operation. */
  private readonly viewers: ViewerResolver;
  // #endregion

  // #region Constructor
  /** Supplies the dependencies of this operation. */

  public constructor(
    members: MemberDirectory,
    private readonly fields: CustomFieldSpacePort,
    private readonly spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
  }
  // #endregion

  // #region Methods
  /** Runs the requested field operation. */

  public async space(actor: CustomFieldActor, spaceId: string, write: boolean): Promise<void> {
    const viewer: Viewer = await this.viewers.resolve(
      actor.organizationId,
      actor.actorUserId,
      write,
    );
    const access = await this.fields.resolve(actor.organizationId, spaceId, viewer, write);
    if (access === null) throw new TaskRefusal({ reason: 'space-not-found' });
    if (write && !access.canManage) throw new CustomFieldRefusal('manage-forbidden');
  }

  public async list(actor: CustomFieldActor, listId: string): Promise<string> {
    const viewer: Viewer = await this.viewers.resolve(actor.organizationId, actor.actorUserId);
    const placement = await this.spaces.findVisibleList(actor.organizationId, viewer, listId);
    if (placement === null) throw new TaskRefusal({ reason: 'list-not-found' });
    return placement.list.spaceId;
  }
  // #endregion
}
