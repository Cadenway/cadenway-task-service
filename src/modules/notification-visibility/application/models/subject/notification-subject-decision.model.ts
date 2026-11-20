/** Visibility and any approved display information, in the requested order. */
export type NotificationSubjectDecision =
  | { readonly visible: false }
  | {
      readonly visible: true;
      readonly display?: {
        readonly taskId: string;
        readonly taskKey: string;
        readonly taskName: string;
        readonly commentExcerpt?: string | null;
      };
    };
