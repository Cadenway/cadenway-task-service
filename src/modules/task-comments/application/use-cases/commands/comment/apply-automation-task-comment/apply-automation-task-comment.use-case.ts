import type { AutomationCommentInput } from '../../../../models/comment/automation-comment-input.model.js';
import type { CreateComment } from '../create-comment/create-comment.use-case.js';

/** Applies a comment action on behalf of an authenticated automation rule. */
export class ApplyAutomationTaskComment {
  // #region Properties
  /** The shared comment write and its task-owned authorization. */
  private readonly createComment: CreateComment;
  // #endregion

  // #region Constructor
  /** Takes the transactional comment creation use case. */
  public constructor(createComment: CreateComment) {
    this.createComment = createComment;
  }
  // #endregion

  // #region Methods
  /** Checks authorization before allowing a stored receipt to replay. */
  public authorize(
    input: Pick<AutomationCommentInput, 'organizationId' | 'taskKey' | 'ruleAuthorUserId'>,
  ): Promise<boolean> {
    return this.createComment.authorizeAutomation(input);
  }

  /** Writes a comment and its activity and outbox event in one tenant transaction. */
  public execute(input: AutomationCommentInput): Promise<void> {
    return this.createComment.executeAutomation(input);
  }
  // #endregion
}
