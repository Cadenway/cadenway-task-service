/** Active spaces on which the viewer has an effective space role. */
export type ResolveGoalSpacesOutput = readonly {
  readonly id: string;
  readonly role: 'edit' | 'comment' | 'view';
}[];
