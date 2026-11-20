/** Ordered space content provisioned with the normal space, list and task creation policies. */
export interface OnboardingPreset {
  // #region Properties
  /** Description of the space created from the preset. */
  readonly spaceDescription: string;

  /** Complete list set, including the first list created with the space. */
  readonly listNames: readonly [string, ...string[]];

  /** Sample tasks in creation order, all assigned to the member who finishes the wizard. */
  readonly examples: readonly {
    readonly name: string;
    readonly listIndex: number;
    readonly status: 'progress' | 'todo';
    readonly priority: 'moyenne';
    readonly description: string;
  }[];
  // #endregion
}
