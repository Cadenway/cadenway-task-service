import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { CreateList } from '../../list/create-list/create-list.use-case.js';
import type { CreateSpace } from '../create-space/create-space.use-case.js';
import type { ProvisionOnboardingSpaceInput } from './provision-onboarding-space.input.js';
import type { ProvisionOnboardingSpaceOutput } from './provision-onboarding-space.output.js';

/** Creates a preset space using the normal space and list creation policies. */
export class ProvisionOnboardingSpace {
  // #region Constructor
  /** Uses the tenant transaction shared with the onboarding command. */
  public constructor(
    private readonly work: SpacesUnitOfWork,
    private readonly createSpace: CreateSpace,
    private readonly createList: CreateList,
  ) {}
  // #endregion

  // #region Methods
  /** Creates the space and each list in one transaction and returns their identifiers. */
  public async execute(
    input: ProvisionOnboardingSpaceInput,
  ): Promise<ProvisionOnboardingSpaceOutput> {
    const firstListName = input.listNames[0];
    if (firstListName === undefined) throw new Error('An onboarding preset needs a first list.');
    return this.work.run(async () => {
      const { space, firstList } = await this.createSpace.executeForOnboarding(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          name: input.name,
          prefix: input.prefix,
          description: input.description,
          icon: null,
          color: input.color,
          visibility: 'organization',
        },
        firstListName,
      );
      const listIds = [firstList.list.id];
      for (const name of input.listNames.slice(1)) {
        const result = await this.createList.execute({
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          spaceId: space.space.id,
          name,
          icon: null,
          color: 'gris',
          sprint: null,
          organizationAccess: true,
        });
        listIds.push(result.list.id);
      }
      return { spaceId: space.space.id, listIds };
    });
  }

  /** Identifies a space refusal for the calling module without exposing the internal error. */
  public static refusalOf(
    error: unknown,
  ):
    | { readonly reason: 'prefix-taken'; readonly prefix: string }
    | { readonly reason: 'organization-not-found' | 'role-forbidden' | 'space-not-found' }
    | null {
    if (!(error instanceof SpaceRefusal)) return null;
    const refusal = error.refusal;
    if (refusal.reason === 'prefix-taken') return refusal;
    if (
      refusal.reason === 'organization-not-found' ||
      refusal.reason === 'role-forbidden' ||
      refusal.reason === 'space-not-found'
    )
      return { reason: refusal.reason };
    return null;
  }
  // #endregion
}
