import { describe, expect, it, vi } from 'vitest';

import { Onboarding } from '../../../../../domain/aggregates/onboarding/onboarding.aggregate.js';
import type { OnboardingRepository } from '../../../../ports/outbound/persistence/onboarding/onboarding-repository.port.js';
import { RecordFirstOnboardingTask } from './record-first-onboarding-task.use-case.js';

const input = {
  organizationId: '019a7000-0000-7000-8000-000000000001',
  actorUserId: '019a7000-0000-7000-8000-000000000002',
  spaceId: '019a7000-0000-7000-8000-000000000003',
};
const firstListId = '019a7000-0000-7000-8000-000000000004';

function fixture(current: Onboarding | null) {
  const find = vi.fn<OnboardingRepository['find']>(() => Promise.resolve(current));
  const save = vi.fn<OnboardingRepository['save']>(() => Promise.resolve(true));
  const createInitial = vi.fn<OnboardingRepository['createInitial']>(() => Promise.resolve());
  const repository: OnboardingRepository = { find, save, createInitial };
  const useCase = new RecordFirstOnboardingTask({ run: (work) => work(repository) });
  return { useCase, find, save, createInitial };
}

describe('RecordFirstOnboardingTask', () => {
  it('leaves absent member state absent', async () => {
    const { useCase, find, save, createInitial } = fixture(null);
    await useCase.execute(input);
    expect(find).toHaveBeenCalledWith(input.organizationId, input.actorUserId, true);
    expect(createInitial).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('saves the domain transition with the locked version for the provisioned space', async () => {
    const current = Onboarding.initial(input.organizationId, input.actorUserId).complete(
      { name: 'Product', prefix: 'CAD', preset: 'blank' },
      { spaceId: input.spaceId, firstListId },
    );
    const { useCase, save } = fixture(current);
    await useCase.execute(input);
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]?.[0].version).toBe(current.snapshot.version + 1);
    expect(save.mock.calls[0]?.[0].checklist.firstTaskCreated).toBe(true);
    expect(save.mock.calls[0]?.[1]).toBe(current.snapshot.version);
  });

  it('does not save a task in a different space or an already recorded marker', async () => {
    const current = Onboarding.initial(input.organizationId, input.actorUserId).complete(
      { name: 'Product', prefix: 'CAD', preset: 'blank' },
      { spaceId: input.spaceId, firstListId },
    );
    const otherSpace = fixture(current);
    await otherSpace.useCase.execute({ ...input, spaceId: firstListId });
    expect(otherSpace.save).not.toHaveBeenCalled();
    const recorded = current.recordFirstTask({
      organizationId: input.organizationId,
      userId: input.actorUserId,
      spaceId: input.spaceId,
    });
    const alreadyRecorded = fixture(recorded);
    await alreadyRecorded.useCase.execute(input);
    expect(alreadyRecorded.save).not.toHaveBeenCalled();
  });

  it('fails the transaction if the locked version cannot be saved', async () => {
    const current = Onboarding.initial(input.organizationId, input.actorUserId).complete(
      { name: 'Product', prefix: 'CAD', preset: 'blank' },
      { spaceId: input.spaceId, firstListId },
    );
    const { useCase, save } = fixture(current);
    save.mockResolvedValueOnce(false);
    await expect(useCase.execute(input)).rejects.toThrow(
      'The locked onboarding state changed unexpectedly.',
    );
  });
});
