/** The verified actor and preset content for a new onboarding space. */
export interface ProvisionOnboardingSpaceInput {
  // #region Properties
  /** Fields of the preset space, taken from the verified actor and the chosen preset. */
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly name: string;
  readonly prefix: string;
  readonly color:
    | 'gris'
    | 'violet'
    | 'indigo'
    | 'azur'
    | 'lagon'
    | 'vert'
    | 'olive'
    | 'jaune'
    | 'orange'
    | 'rouge'
    | 'rose'
    | 'fuchsia'
    | 'ardoise';
  readonly description: string | null;
  readonly listNames: readonly string[];
  // #endregion
}
