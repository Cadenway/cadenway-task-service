/** One durable vote. The change reason stays in the task comment (P3c-1 decision 4). */
export type RecordedApprovalVote = { readonly decidedAt: Date } & (
  | { readonly decision: 'approved'; readonly commentId: null }
  | { readonly decision: 'changes-requested'; readonly commentId: string }
);
