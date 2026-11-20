import { principalOf, ProblemException, runWithOrganizationContext } from '@cadenway/nest-common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { CreateSpaceCustomField } from '../../../../application/use-cases/commands/custom-field/create-space-custom-field/create-space-custom-field.use-case.js';
import { CustomFieldSpacePath } from '../../dto/input/custom-field/custom-field-space-path.dto.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { answerCustomFieldRefusals } from '../../mappers/custom-field/custom-field-refusal.mapper.js';

/** Checks current management rights before replaying an idempotent creation. */
@Injectable()
export class CustomFieldReplayAccessGuard implements CanActivate {
  // #region Constructor
  /** Binds the creation access check. */
  public constructor(private readonly createField: CreateSpaceCustomField) {}
  // #endregion

  // #region Methods
  /** Leaves malformed paths to the normal parameter validation. */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.headers['idempotency-key'] === undefined) return true;
    const path = CustomFieldSpacePath.schema.safeParse(request.params);
    if (!path.success) return true;
    const principal = principalOf(request);
    if (principal === undefined)
      throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
    await runWithOrganizationContext(principal, () =>
      answerCustomFieldRefusals(() =>
        this.createField.assertCanReplay({
          ...toCaller(),
          spaceId: path.data.spaceId.toLowerCase(),
        }),
      ),
    );
    return true;
  }
  // #endregion
}
