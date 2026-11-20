import { OnboardingError } from '../../errors/onboarding/onboarding.error.js';
import type { OnboardingChecklistPatch } from '../../value-objects/onboarding/onboarding-checklist-patch.value-object.js';
import { ONBOARDING_COLORS } from '../../value-objects/onboarding/onboarding-color.value-object.js';
import type { OnboardingDraftPatch } from '../../value-objects/onboarding/onboarding-draft-patch.value-object.js';
import type { OnboardingFinishInput } from '../../value-objects/onboarding/onboarding-finish-input.value-object.js';
import { ONBOARDING_PRESET_KEYS } from '../../value-objects/onboarding/onboarding-preset-key.value-object.js';
import {
  ONBOARDING_PRESENTATIONS,
  ONBOARDING_STATUSES,
  ONBOARDING_STEPS,
} from '../../value-objects/onboarding/onboarding-state.value-object.js';
import type { OnboardingState } from '../../value-objects/onboarding/onboarding-state.value-object.js';

type Wizard = OnboardingState['wizard'];
type Provisioning = NonNullable<OnboardingState['provisioning']>;
type OrdinaryTaskCreation = Pick<OnboardingState, 'organizationId' | 'userId'> &
  Pick<Provisioning, 'spaceId'>;
type DraftErrorReason = 'invalid-draft' | 'invalid-state';

const defaultColor = 'violet';
const spacePrefix = /^[A-Z]{2,5}$/;
const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Space creation trims names and refuses an empty or overlong result. */
function normalizeName(name: string, reason: DraftErrorReason = 'invalid-draft'): string {
  const trimmed = name.trim();
  if (
    !trimmed ||
    Array.from(trimmed).length > 80 ||
    trimmed.includes('\u0000') ||
    /[\uD800-\uDFFF]/u.test(trimmed)
  ) {
    throw new OnboardingError(reason);
  }
  return trimmed;
}

function validateDraft(
  wizard: Pick<Wizard, 'preset' | 'prefix' | 'color'>,
  reason: DraftErrorReason = 'invalid-draft',
): void {
  if (
    (wizard.prefix !== null && !spacePrefix.test(wizard.prefix)) ||
    !ONBOARDING_PRESET_KEYS.includes(wizard.preset) ||
    !ONBOARDING_COLORS.includes(wizard.color)
  ) {
    throw new OnboardingError(reason);
  }
}

function validateState(state: OnboardingState): void {
  const { checklist, provisioning, wizard } = state;
  if (
    !state.organizationId ||
    !state.userId ||
    !Number.isSafeInteger(state.version) ||
    state.version < 1 ||
    !ONBOARDING_STATUSES.includes(wizard.status) ||
    !ONBOARDING_STEPS.includes(wizard.step) ||
    !ONBOARDING_PRESENTATIONS.includes(checklist.presentation) ||
    typeof checklist.firstTaskCreated !== 'boolean' ||
    typeof checklist.invitationSent !== 'boolean' ||
    typeof checklist.boardTried !== 'boolean'
  ) {
    throw new OnboardingError('invalid-state');
  }
  if (provisioning === null) {
    if (
      wizard.status === 'finished' ||
      checklist.firstTaskCreated ||
      checklist.boardTried ||
      checklist.presentation !== 'expanded'
    ) {
      throw new OnboardingError('invalid-state');
    }
  } else if (
    wizard.status !== 'finished' ||
    wizard.step !== 'import' ||
    wizard.name === null ||
    wizard.prefix === null ||
    !uuidV7.test(provisioning.spaceId) ||
    !uuidV7.test(provisioning.firstListId)
  ) {
    throw new OnboardingError('invalid-state');
  }
  validateDraft(wizard, 'invalid-state');
  if (wizard.name !== null && normalizeName(wizard.name, 'invalid-state') !== wizard.name) {
    throw new OnboardingError('invalid-state');
  }
}

function sameWizard(left: Wizard, right: Wizard): boolean {
  return (
    left.status === right.status &&
    left.step === right.step &&
    left.preset === right.preset &&
    left.name === right.name &&
    left.prefix === right.prefix &&
    left.color === right.color
  );
}

/** Owns personal onboarding state and its version as specified by `/v1/me/onboarding`. */
export class Onboarding {
  // #region Properties
  /** The read-only state to persist or project for the current caller. */
  public readonly snapshot: OnboardingState;
  // #endregion

  // #region Constructor
  /** Validates the state and detaches it from objects supplied by persistence or callers. */
  private constructor(state: OnboardingState) {
    validateState(state);
    this.snapshot = Object.freeze({
      ...state,
      wizard: Object.freeze({ ...state.wizard }),
      provisioning: state.provisioning === null ? null : Object.freeze({ ...state.provisioning }),
      checklist: Object.freeze({ ...state.checklist }),
    });
  }
  // #endregion

  // #region Methods
  /** Builds the contract's initial version, before an organization member makes a change. */
  public static initial(organizationId: string, userId: string): Onboarding {
    return new Onboarding({
      organizationId,
      userId,
      version: 1,
      wizard: {
        status: 'in-progress',
        step: 'space',
        preset: 'dev',
        name: null,
        prefix: null,
        color: defaultColor,
      },
      provisioning: null,
      checklist: {
        presentation: 'expanded',
        firstTaskCreated: false,
        invitationSent: false,
        boardTried: false,
      },
    });
  }

  /** Reconstitutes an existing member's aggregate from its scoped stored state. */
  public static restore(state: OnboardingState): Onboarding {
    return new Onboarding(state);
  }

  /** Saves supplied draft choices, including terminal dismissal. Identical drafts keep their version. */
  public patchDraft(input: OnboardingDraftPatch): Onboarding {
    const current = this.snapshot.wizard;
    const wizard: Wizard = {
      status: input.dismissed === true ? 'dismissed' : current.status,
      step: input.step ?? current.step,
      preset: input.preset ?? current.preset,
      color: input.color ?? current.color,
      name: input.name === undefined ? current.name : input.name,
      prefix: input.prefix === undefined ? current.prefix : input.prefix,
    };
    const normalized = {
      ...wizard,
      name: wizard.name === null ? null : normalizeName(wizard.name),
    };
    if (sameWizard(normalized, current)) return this;
    this.requireOpen();
    validateDraft(normalized);
    return this.next({ wizard: normalized });
  }

  /** Records invitation success at any time. Presentation and Board require provisioning. */
  public patchChecklist(input: OnboardingChecklistPatch): Onboarding {
    if (
      this.snapshot.provisioning === null &&
      (input.presentation !== undefined || input.boardTried === true)
    ) {
      throw new OnboardingError('checklist-unavailable');
    }
    const current = this.snapshot.checklist;
    const checklist: OnboardingState['checklist'] = {
      ...current,
      presentation: input.presentation ?? current.presentation,
      invitationSent: current.invitationSent || input.invitationSent === true,
      boardTried: current.boardTried || input.boardTried === true,
    };
    if (
      checklist.presentation === current.presentation &&
      checklist.invitationSent === current.invitationSent &&
      checklist.boardTried === current.boardTried
    ) {
      return this;
    }
    return this.next({ checklist });
  }

  /** Checks and normalizes the finish command before its transaction creates the resources. */
  public planFinish(input: OnboardingFinishInput): Required<OnboardingFinishInput> {
    this.requireOpen();
    const plan = {
      name: normalizeName(input.name),
      prefix: input.prefix,
      preset: input.preset,
      color: input.color ?? defaultColor,
    };
    validateDraft(plan);
    return plan;
  }

  /** Closes the wizard when its space and first list have been created in the same transaction. */
  public complete(input: OnboardingFinishInput, provisioning: Provisioning): Onboarding {
    const plan = this.planFinish(input);
    return this.next({ wizard: { status: 'finished', step: 'import', ...plan }, provisioning });
  }

  /** Advances the first-task marker for an ordinary creation by this member in the provisioned space. */
  public recordFirstTask(creation: OrdinaryTaskCreation): Onboarding {
    const { organizationId, userId, provisioning, checklist } = this.snapshot;
    if (
      provisioning === null ||
      checklist.firstTaskCreated ||
      creation.organizationId !== organizationId ||
      creation.userId !== userId ||
      creation.spaceId !== provisioning.spaceId
    ) {
      return this;
    }
    return this.next({ checklist: { ...checklist, firstTaskCreated: true } });
  }

  private requireOpen(): void {
    if (this.snapshot.wizard.status !== 'in-progress') {
      throw new OnboardingError('wizard-closed');
    }
  }

  private next(
    changes: Partial<Pick<OnboardingState, 'wizard' | 'provisioning' | 'checklist'>>,
  ): Onboarding {
    return new Onboarding({ ...this.snapshot, ...changes, version: this.snapshot.version + 1 });
  }
  // #endregion
}
