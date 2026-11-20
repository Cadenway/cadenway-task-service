import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { DescriptionMention } from '../../../domain/value-objects/mention/description-mention.value-object.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';
import type { MemberDirectory } from '../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';

/** Keeps membership and list access stable while a task stores structured mention spans. */
export class DescriptionMentionGuard {
  // #region Constructor
  /** Uses the tenant-scoped membership and placement ports. */
  public constructor(
    private readonly members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
  ) {}
  // #endregion

  // #region Methods
  /** Locks memberships before any task or placement lock, deferring eligibility refusals. */
  public async lockRecipients(
    organizationId: string,
    actor: Viewer,
    mentions: readonly DescriptionMention[],
  ): Promise<readonly (Viewer | null)[]> {
    const recipients: (Viewer | null)[] = [];
    for (const userId of [...new Set(mentions.map((mention) => mention.userId))].sort()) {
      if (userId === actor.userId) {
        recipients.push(actor);
        continue;
      }
      const role = await this.members.roleOf(organizationId, userId, true);
      recipients.push(role === null ? null : { userId, role });
    }
    return recipients;
  }

  /** Refuses any unavailable account after the caller's edit access has been established. */
  public async requireEligible(
    organizationId: string,
    listId: string,
    recipients: readonly (Viewer | null)[],
  ): Promise<void> {
    for (const recipient of recipients) {
      if (
        recipient === null ||
        (await this.spaces.findVisibleList(organizationId, recipient, listId)) === null
      ) {
        throw new TaskRefusal({ reason: 'mention-recipient-invalid' });
      }
    }
  }
  // #endregion
}
