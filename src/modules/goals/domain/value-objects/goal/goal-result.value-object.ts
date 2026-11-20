/** Stored key result. Linked targets are measured for each reader (P3c brief, P3c-2). */
export type GoalResult = { readonly id: string; readonly label: string } & (
  | {
      readonly kind: 'number';
      readonly startValue: number;
      readonly currentValue: number;
      readonly targetValue: number;
    }
  | { readonly kind: 'checkbox'; readonly checked: boolean }
  | { readonly kind: 'list-progress'; readonly listId: string }
  | { readonly kind: 'milestone'; readonly taskKey: string }
);
