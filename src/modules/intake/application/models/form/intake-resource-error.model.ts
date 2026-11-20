type IntakeResourceFailure =
  | { readonly kind: 'organization-not-found' | 'task-not-found' }
  | {
      readonly kind: 'task-trashed';
      readonly details: {
        readonly key: string;
        readonly name: string;
        readonly entryId: string;
        readonly rootKey: string;
        readonly trashedAt: string;
        readonly trashedBy: {
          readonly type: 'user' | 'automation' | 'git' | 'system';
          readonly id: string;
        };
        readonly purgeAt: string;
      };
    };

/** An unavailable organization or task, including authorized trash details when appropriate. */
export class IntakeResourceError extends Error {
  // #region Constructor
  /** Retains the resource refusal without exposing other request data. */
  public constructor(public readonly failure: IntakeResourceFailure) {
    super('The requested intake resource is unavailable.');
    this.name = 'IntakeResourceError';
  }
  // #endregion
}
