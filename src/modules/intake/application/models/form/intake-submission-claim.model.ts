/** Result of a nonblocking, transaction-scoped idempotency claim. */
export type IntakeSubmissionClaim =
  | { readonly kind: 'acquired' }
  | { readonly kind: 'replay'; readonly receipt: string }
  | { readonly kind: 'in-progress' }
  | { readonly kind: 'key-reused' };
