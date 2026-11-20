import { Onboarding } from '../../../domain/aggregates/onboarding/onboarding.aggregate.js';
import { OnboardingError } from '../../../domain/errors/onboarding/onboarding.error.js';
import type { OnboardingActor } from '../../models/onboarding/onboarding-actor.model.js';
import { OnboardingRefusal } from '../../models/onboarding/onboarding-refusal.model.js';
import type { OnboardingRepository } from '../../ports/outbound/persistence/onboarding/onboarding-repository.port.js';

/** Loads the default or lockable stored state and enforces the version condition. */
export class OnboardingStateService {
  // #region Methods
  /** Translates expected domain refusals while retaining invalid stored-state failures. */
  public apply<T>(work: () => T): T {
    try {
      return work();
    } catch (error: unknown) {
      if (error instanceof OnboardingError && error.reason !== 'invalid-state') {
        throw new OnboardingRefusal(error.reason);
      }
      throw error;
    }
  }

  /** Runs the requested operation. */
  public async read(repository: OnboardingRepository, actor: OnboardingActor): Promise<Onboarding> {
    return (
      (await repository.find(actor.organizationId, actor.actorUserId, false)) ??
      Onboarding.initial(actor.organizationId, actor.actorUserId)
    );
  }

  public async lock(
    repository: OnboardingRepository,
    actor: OnboardingActor,
    versions: readonly number[] | null,
  ): Promise<Onboarding> {
    await repository.createInitial(actor.organizationId, actor.actorUserId);
    const current = await repository.find(actor.organizationId, actor.actorUserId, true);
    if (current === null) throw new Error('The initialized onboarding state is missing.');
    if (versions !== null && !versions.includes(current.snapshot.version)) {
      throw new OnboardingRefusal('version-mismatch', current.snapshot.version);
    }
    return current;
  }

  public async save(
    repository: OnboardingRepository,
    current: Onboarding,
    next: Onboarding,
  ): Promise<void> {
    if (next === current) return;
    if (!(await repository.save(next.snapshot, current.snapshot.version))) {
      throw new Error('The locked onboarding state changed unexpectedly.');
    }
  }
  // #endregion
}
