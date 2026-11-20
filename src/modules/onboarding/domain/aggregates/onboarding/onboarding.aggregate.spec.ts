import { GetOnboardingInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import { OnboardingError } from '../../errors/onboarding/onboarding.error.js';
import { Onboarding } from './onboarding.aggregate.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const userId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e02';
const spaceId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e05';
const firstListId = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f20';
const creation = { organizationId, userId, spaceId };
const finish = { name: 'Produit', prefix: 'CAD', preset: 'dev' } as const;

function initial(): Onboarding {
  return Onboarding.initial(organizationId, userId);
}

describe('Onboarding', () => {
  it('starts at contract version one with the default draft and empty checklist', () => {
    const state = initial().snapshot;
    expect(GetOnboardingInternalResponse.parse(state)).toEqual({
      version: 1,
      wizard: {
        status: 'in-progress',
        step: 'space',
        preset: 'dev',
        name: null,
        prefix: null,
        color: 'violet',
      },
      provisioning: null,
      checklist: {
        presentation: 'expanded',
        firstTaskCreated: false,
        invitationSent: false,
        boardTried: false,
      },
    });
    expect(state).toMatchObject({ organizationId, userId });
  });

  it('updates only submitted draft values, normalizes names, and clears explicit nulls', () => {
    const state = initial().patchDraft({ step: 'preset', name: ' Produit ', prefix: 'CAD' });
    expect(state.snapshot).toMatchObject({
      version: 2,
      wizard: { step: 'preset', name: 'Produit', prefix: 'CAD', preset: 'dev', color: 'violet' },
    });
    expect(state.patchDraft({ name: ' Produit ' })).toBe(state);
    expect(state.patchDraft({ name: null, prefix: null }).snapshot).toMatchObject({
      version: 3,
      wizard: { step: 'preset', name: null, prefix: null },
    });
  });

  it('rejects a blank draft name and an invalid explicit prefix', () => {
    expect(() => initial().patchDraft({ name: '   ' })).toThrow(OnboardingError);
    expect(() => initial().patchDraft({ prefix: 'cad' })).toThrow(OnboardingError);
    expect(() => initial().planFinish({ ...finish, prefix: 'C' })).toThrow(OnboardingError);
  });

  it('preserves astral Unicode names and refuses text the database cannot store exactly', () => {
    expect(initial().patchDraft({ name: ' Produit \u{1F7E3} ' }).snapshot.wizard.name).toBe(
      'Produit \u{1F7E3}',
    );
    expect(() => initial().patchDraft({ name: 'Produit\u0000' })).toThrow(
      new OnboardingError('invalid-draft'),
    );
    expect(() => initial().patchDraft({ name: 'Produit\uD800' })).toThrow(
      new OnboardingError('invalid-draft'),
    );
  });

  it('retains the draft on dismissal and preserves the version on repeated dismissal', () => {
    const draft = initial().patchDraft({ step: 'preset', name: 'Produit', prefix: 'CAD' });
    const dismissal = {
      dismissed: true,
      step: 'team',
      name: 'Atelier Nord',
      prefix: null,
      preset: 'agency',
      color: 'azur',
    } as const;
    const dismissed = draft.patchDraft(dismissal);
    expect(dismissed.snapshot).toMatchObject({
      version: 3,
      provisioning: null,
    });
    expect(dismissed.snapshot.wizard).toEqual({ ...draft.snapshot.wizard, status: 'dismissed' });
    expect(dismissed.patchDraft(dismissal)).toBe(dismissed);
    expect(dismissed.patchDraft({ name: 'Produit' })).toBe(dismissed);
    expect(() => dismissed.patchDraft({ step: 'team' })).toThrow(
      new OnboardingError('wizard-closed'),
    );
    expect(() => dismissed.planFinish(finish)).toThrow(new OnboardingError('wizard-closed'));
  });

  it('records invitation success before provisioning and refuses other checklist changes', () => {
    const invitation = initial().patchChecklist({ invitationSent: true });
    expect(invitation.snapshot).toMatchObject({ version: 2, checklist: { invitationSent: true } });
    expect(invitation.patchChecklist({ invitationSent: true })).toBe(invitation);
    for (const patch of [{ presentation: 'collapsed' }, { boardTried: true }] as const) {
      expect(() => invitation.patchChecklist(patch)).toThrow(
        new OnboardingError('checklist-unavailable'),
      );
    }
  });

  it('records final input, preserves the invitation, and defaults omitted finish color to violet', () => {
    const draft = initial()
      .patchChecklist({ invitationSent: true })
      .patchDraft({ preset: 'agency', color: 'azur' });
    const completed = draft.complete({ ...finish, name: ' Produit ' }, { spaceId, firstListId });
    expect(completed.snapshot).toMatchObject({
      version: 4,
      wizard: { status: 'finished', step: 'import', ...finish, color: 'violet' },
      provisioning: { spaceId, firstListId },
      checklist: { presentation: 'expanded', invitationSent: true, firstTaskCreated: false },
    });
    expect(() => completed.planFinish(finish)).toThrow(new OnboardingError('wizard-closed'));
    expect(() => completed.patchDraft({ dismissed: true })).toThrow(
      new OnboardingError('wizard-closed'),
    );
  });

  it('updates checklist presentation and Board progress once provisioned', () => {
    const completed = initial().complete(finish, { spaceId, firstListId });
    const collapsed = completed.patchChecklist({ presentation: 'collapsed', boardTried: true });
    expect(collapsed.snapshot).toMatchObject({
      version: 3,
      checklist: { presentation: 'collapsed', boardTried: true },
    });
    expect(collapsed.patchChecklist({ boardTried: true })).toBe(collapsed);
    expect(
      collapsed.patchChecklist({ presentation: 'dismissed' }).snapshot.checklist,
    ).toMatchObject({
      presentation: 'dismissed',
      boardTried: true,
    });
  });

  it('marks the first ordinary task only after provisioning for the same actor, space and tenant', () => {
    const draft = initial();
    expect(draft.recordFirstTask(creation)).toBe(draft);
    const completed = draft.complete(finish, { spaceId, firstListId });
    expect(completed.recordFirstTask({ ...creation, spaceId: firstListId })).toBe(completed);
    expect(completed.recordFirstTask({ ...creation, userId: firstListId })).toBe(completed);
    expect(completed.recordFirstTask({ ...creation, organizationId: firstListId })).toBe(completed);
    const done = completed.recordFirstTask(creation);
    expect(done.snapshot).toMatchObject({ version: 3, checklist: { firstTaskCreated: true } });
    expect(done.recordFirstTask(creation)).toBe(done);
  });

  it('rejects inconsistent stored completion or first-task markers', () => {
    const initialState = initial().snapshot;
    expect(() =>
      Onboarding.restore({ ...initialState, provisioning: { spaceId, firstListId } }),
    ).toThrow(OnboardingError);
    expect(() =>
      Onboarding.restore({
        ...initialState,
        checklist: { ...initialState.checklist, firstTaskCreated: true },
      }),
    ).toThrow(OnboardingError);
  });

  it('distinguishes invalid stored draft data from a refused request', () => {
    const state = initial().snapshot;
    expect(() =>
      Onboarding.restore({ ...state, wizard: { ...state.wizard, prefix: 'cad' } }),
    ).toThrow(new OnboardingError('invalid-state'));
  });
});
