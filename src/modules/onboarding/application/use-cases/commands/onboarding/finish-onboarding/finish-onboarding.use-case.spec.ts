import { describe, expect, it, vi } from 'vitest';

import { Onboarding } from '../../../../../domain/aggregates/onboarding/onboarding.aggregate.js';
import type { OnboardingMembers } from '../../../../ports/outbound/membership/onboarding/onboarding-members.port.js';
import type { OnboardingRepository } from '../../../../ports/outbound/persistence/onboarding/onboarding-repository.port.js';
import type { OnboardingProvisioner } from '../../../../ports/outbound/provisioning/onboarding/onboarding-provisioner.port.js';
import type { OnboardingUnitOfWork } from '../../../../ports/outbound/transactions/onboarding/onboarding-unit-of-work.port.js';
import { GetOnboarding } from '../../../queries/onboarding/get-onboarding/get-onboarding.use-case.js';
import { UpdateOnboardingChecklist } from '../update-onboarding-checklist/update-onboarding-checklist.use-case.js';
import { FinishOnboarding } from './finish-onboarding.use-case.js';

const actor = {
  organizationId: '019a7000-0000-7000-8000-000000000001',
  actorUserId: '019a7000-0000-7000-8000-000000000002',
  userId: '019a7000-0000-7000-8000-000000000002',
};
const resources = {
  spaceId: '019a7000-0000-7000-8000-000000000003',
  firstListId: '019a7000-0000-7000-8000-000000000004',
};

function fixture(role: 'member' | 'guest' = 'member') {
  let current: Onboarding | null = null;
  const createInitial = vi.fn<OnboardingRepository['createInitial']>(() => {
    current ??= Onboarding.initial(actor.organizationId, actor.userId);
    return Promise.resolve();
  });
  const save = vi.fn<OnboardingRepository['save']>((state, expectedVersion) => {
    if (current?.snapshot.version !== expectedVersion) return Promise.resolve(false);
    current = Onboarding.restore(state);
    return Promise.resolve(true);
  });
  const provision = vi.fn<OnboardingProvisioner['provision']>(() => Promise.resolve(resources));
  const repository: OnboardingRepository = {
    createInitial,
    find: () => Promise.resolve(current),
    save,
  };
  const members: OnboardingMembers = { find: () => Promise.resolve({ role }) };
  const work: OnboardingUnitOfWork = {
    run: (callback) => callback(repository),
    runReadOnly: (callback) => callback(repository),
  };
  const provisioner: OnboardingProvisioner = { provision };
  return { repository, members, work, provisioner, createInitial, save, provision };
}

describe('FinishOnboarding', () => {
  it('returns the initial state without inserting it', async () => {
    const { createInitial, members, work } = fixture();
    const result = await new GetOnboarding(work, members).execute(actor);
    expect(result.version).toBe(1);
    expect(createInitial).not.toHaveBeenCalled();
  });

  it('retains the invitation marker and uses ordinary provisioning before saving the result', async () => {
    const { save, provision, members, work, provisioner } = fixture();
    await new UpdateOnboardingChecklist(work, members).execute({
      ...actor,
      expectedVersions: [1],
      patch: { invitationSent: true },
    });
    const result = await new FinishOnboarding(work, members, provisioner).execute({
      ...actor,
      expectedVersions: [2],
      finish: { name: ' Produit ', prefix: 'CAD', preset: 'dev' },
    });
    expect(result.provisioning).toEqual(resources);
    expect(result.checklist.invitationSent).toBe(true);
    expect(result.checklist.firstTaskCreated).toBe(false);
    expect(result.version).toBe(3);
    expect(provision).toHaveBeenCalledWith(
      actor.organizationId,
      actor.actorUserId,
      { name: 'Produit', prefix: 'CAD', preset: 'dev', color: 'violet' },
      expect.objectContaining({ listNames: ['Backlog', 'Sprint 1', 'Bugs'] }),
    );
    expect(provision.mock.invocationCallOrder[0]).toBeLessThan(
      save.mock.invocationCallOrder[1] ?? 0,
    );
  });

  it('does not persist completion when provisioning fails', async () => {
    const { save, provision, members, work, provisioner } = fixture();
    provision.mockRejectedValueOnce(new Error('create failed'));
    await expect(
      new FinishOnboarding(work, members, provisioner).execute({
        ...actor,
        expectedVersions: [1],
        finish: { name: 'Produit', prefix: 'CAD', preset: 'blank' },
      }),
    ).rejects.toThrow('create failed');
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects stale versions, other users and guests before provisioning', async () => {
    const regular = fixture();
    const finish = new FinishOnboarding(regular.work, regular.members, regular.provisioner);
    const command = {
      ...actor,
      expectedVersions: [2],
      finish: { name: 'Produit', prefix: 'CAD', preset: 'blank' as const },
    };
    await expect(finish.execute(command)).rejects.toMatchObject({
      reason: 'version-mismatch',
      version: 1,
    });
    await expect(finish.execute({ ...command, userId: resources.spaceId })).rejects.toMatchObject({
      reason: 'user-not-found',
    });
    expect(regular.provision).not.toHaveBeenCalled();
    const guest = fixture('guest');
    await expect(
      new FinishOnboarding(guest.work, guest.members, guest.provisioner).assertCanReplay(actor),
    ).rejects.toMatchObject({ reason: 'role-forbidden' });
  });
});
