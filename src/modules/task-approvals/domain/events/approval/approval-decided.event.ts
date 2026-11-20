/** A designated reviewer recorded or withdrew their vote. */
export type ApprovalDecided = {
  readonly kind: 'approval-decided';
  readonly roundId: string;
  readonly requesterUserId: string;
  readonly reviewerUserId: string;
} & (
  | { readonly decision: 'approved' | 'withdrawn'; readonly commentId: null }
  | { readonly decision: 'changes-requested'; readonly commentId: string }
);
