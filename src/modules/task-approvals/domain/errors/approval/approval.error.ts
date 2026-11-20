import { DomainError } from './domain.error.js';

const reasons = {
  'invalid-state': 'The approval round has invalid stored state.',
  'reviewer-invalid': 'The requested reviewers must be distinct and eligible.',
  'reviewer-required': 'The actor must be a designated eligible reviewer.',
  'vote-already-recorded': 'The reviewer must withdraw the recorded vote before voting again.',
  'invalid-reason': 'A change request must have a valid reason.',
} as const;

/** A round refusal that carries no submitted content or account identifiers. */
export class ApprovalError extends DomainError {
  // #region Constructor
  /** Reports a content-free description of the refused rule. */
  public constructor(public readonly reason: keyof typeof reasons) {
    super(reasons[reason]);
  }
  // #endregion
}
