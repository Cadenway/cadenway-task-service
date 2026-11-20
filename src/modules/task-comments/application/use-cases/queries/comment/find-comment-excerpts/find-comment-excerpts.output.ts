/** Existing live comments among the requested task-comment pairs. */
export type FindCommentExcerptsOutput = readonly {
  readonly taskId: string;
  readonly commentId: string;
  readonly excerpt: string;
}[];
