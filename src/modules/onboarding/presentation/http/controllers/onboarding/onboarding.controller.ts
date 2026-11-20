import type { OnboardingState } from '@cadenway/contracts/types/internal/task-service';
import { formatEtag, InternalAccess } from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { FinishOnboarding } from '../../../../application/use-cases/commands/onboarding/finish-onboarding/finish-onboarding.use-case.js';
import { UpdateOnboardingChecklist } from '../../../../application/use-cases/commands/onboarding/update-onboarding-checklist/update-onboarding-checklist.use-case.js';
import { UpdateOnboarding } from '../../../../application/use-cases/commands/onboarding/update-onboarding/update-onboarding.use-case.js';
import { GetOnboarding } from '../../../../application/use-cases/queries/onboarding/get-onboarding/get-onboarding.use-case.js';
import { OnboardingChecklistBody } from '../../dto/input/onboarding/onboarding-checklist-body.dto.js';
import { OnboardingDraftBody } from '../../dto/input/onboarding/onboarding-draft-body.dto.js';
import { OnboardingFinishBody } from '../../dto/input/onboarding/onboarding-finish-body.dto.js';
import { OnboardingPath } from '../../dto/input/onboarding/onboarding-path.dto.js';
import { answerOnboarding } from '../../errors/onboarding/onboarding.problem.js';
import { OnboardingBodyGuard } from '../../guards/onboarding/onboarding-body.guard.js';
import { OnboardingReplayAccessGuard } from '../../guards/onboarding/onboarding-replay-access.guard.js';
import { onboardingActor, onboardingResponse } from '../../mappers/onboarding/onboarding.mapper.js';
import { onboardingVersionCondition } from '../../mappers/onboarding/version-condition.mapper.js';

/** The private onboarding state of the verified organization member. */
@Controller('internal/v1/users')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class OnboardingController {
  // #region Constructor
  /** Binds the onboarding use cases. */
  public constructor(
    private readonly getState: GetOnboarding,
    private readonly updateState: UpdateOnboarding,
    private readonly updateChecklist: UpdateOnboardingChecklist,
    private readonly finishOnboarding: FinishOnboarding,
  ) {}
  // #endregion

  // #region Methods
  /** Reads the actor's progress. */
  @Get(':userId/onboarding')
  public async get(
    @Param() path: OnboardingPath,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OnboardingState> {
    const state = await answerOnboarding(() => this.getState.execute(onboardingActor(path.userId)));
    response.setHeader('ETag', formatEtag(state.version));
    return onboardingResponse(state);
  }

  /** Saves the actor's draft or dismissal. */
  @Patch(':userId/onboarding')
  @UseGuards(OnboardingBodyGuard)
  public async update(
    @Param() path: OnboardingPath,
    @Body() body: OnboardingDraftBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OnboardingState> {
    const state = await answerOnboarding(() =>
      this.updateState.execute({
        ...onboardingActor(path.userId),
        expectedVersions: onboardingVersionCondition(ifMatch),
        patch: body,
      }),
    );
    response.setHeader('ETag', formatEtag(state.version));
    return onboardingResponse(state);
  }

  /** Saves the actor's checklist markers. */
  @Patch(':userId/onboarding/checklist')
  @UseGuards(OnboardingBodyGuard)
  public async checklist(
    @Param() path: OnboardingPath,
    @Body() body: OnboardingChecklistBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OnboardingState> {
    const state = await answerOnboarding(() =>
      this.updateChecklist.execute({
        ...onboardingActor(path.userId),
        expectedVersions: onboardingVersionCondition(ifMatch),
        patch: body,
      }),
    );
    response.setHeader('ETag', formatEtag(state.version));
    return onboardingResponse(state);
  }

  /** Provisions the preset once in the actor's organization. */
  @Post(':userId/onboarding/finish')
  @HttpCode(201)
  @UseGuards(OnboardingBodyGuard, OnboardingReplayAccessGuard)
  public async finish(
    @Param() path: OnboardingPath,
    @Body() body: OnboardingFinishBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OnboardingState> {
    const state = await answerOnboarding(() =>
      this.finishOnboarding.execute({
        ...onboardingActor(path.userId),
        expectedVersions: onboardingVersionCondition(ifMatch),
        finish: body,
      }),
    );
    if (state.provisioning === null)
      throw new Error('Finished onboarding did not provision a space.');
    response.setHeader('ETag', formatEtag(state.version));
    response.setHeader('Location', `/internal/v1/spaces/${state.provisioning.spaceId}`);
    return onboardingResponse(state);
  }
  // #endregion
}
