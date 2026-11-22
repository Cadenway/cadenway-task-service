import type { AutomationCommentInput } from '../../../../models/comment/automation-comment-input.model.js';
import type { AutomationCommentProof } from '../../../../models/comment/automation-comment-proof.model.js';
import { CommentWriteRefusal } from '../../../../models/comment/comment-write-refusal.model.js';
import type { AutomationCommentAccess } from '../../../../ports/outbound/tasks/task/automation-comment-access.port.js';
import type { CreateComment } from '../create-comment/create-comment.use-case.js';

/** Applies a comment action on behalf of an authenticated automation rule. */
export class ApplyAutomationTaskComment {
  // #region Properties
  // #endregion

  // #region Constructor
  /** Takes the transactional comment creation use case. */
  public constructor(
    private readonly createComment: CreateComment,
    private readonly access: AutomationCommentAccess,
  ) {}
  // #endregion

  // #region Methods
  /** Checks authorization before allowing a stored receipt to replay. */
  public async authorize(
    input: Pick<AutomationCommentInput, 'organizationId' | 'taskKey' | 'ruleAuthorUserId'>,
  ): Promise<AutomationCommentProof | null> {
    const { organizationId, ruleAuthorUserId } = input;
    const proof = await this.access.read(organizationId, ruleAuthorUserId);
    return this.access.run(async () => {
      const current = await proof.confirms(organizationId, ruleAuthorUserId);
      return current && (await this.createComment.authorizeAutomation(input)) ? proof : null;
    });
  }

  /** Writes a comment and its activity and outbox event in one tenant transaction. */
  public async execute(
    input: AutomationCommentInput,
    proof?: AutomationCommentProof,
  ): Promise<void> {
    const { organizationId, ruleAuthorUserId } = input;
    const current = proof ?? (await this.access.read(organizationId, ruleAuthorUserId));
    return this.access.run(async () => {
      if (!(await current.confirms(organizationId, ruleAuthorUserId))) {
        throw new CommentWriteRefusal('task-not-found');
      }
      await this.createComment.executeAutomation(input);
    });
  }
  // #endregion
}
