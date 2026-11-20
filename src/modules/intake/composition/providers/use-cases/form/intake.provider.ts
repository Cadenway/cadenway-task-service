import type { FactoryProvider } from '@nestjs/common';

import type { IntakeUnitOfWork } from '../../../../application/ports/outbound/transactions/form/intake-unit-of-work.port.js';
import { AllocateIntakeAttachment } from '../../../../application/use-cases/commands/attachment/allocate-intake-attachment/allocate-intake-attachment.use-case.js';
import { ReleaseIntakeAttachment } from '../../../../application/use-cases/commands/attachment/release-intake-attachment/release-intake-attachment.use-case.js';
import { DisableIntakeForm } from '../../../../application/use-cases/commands/form/disable-intake-form/disable-intake-form.use-case.js';
import { PublishIntakeForm } from '../../../../application/use-cases/commands/form/publish-intake-form/publish-intake-form.use-case.js';
import { SubmitIntakeForm } from '../../../../application/use-cases/commands/form/submit-intake-form/submit-intake-form.use-case.js';
import { UpdateIntakeForm } from '../../../../application/use-cases/commands/form/update-intake-form/update-intake-form.use-case.js';
import { ResolveIntakeAttachment } from '../../../../application/use-cases/queries/attachment/resolve-intake-attachment/resolve-intake-attachment.use-case.js';
import { GetIntakeContact } from '../../../../application/use-cases/queries/form/get-intake-contact/get-intake-contact.use-case.js';
import { GetIntakeForm } from '../../../../application/use-cases/queries/form/get-intake-form/get-intake-form.use-case.js';
import { GetPublicIntakeForm } from '../../../../application/use-cases/queries/form/get-public-intake-form/get-public-intake-form.use-case.js';
import { INTAKE_UNIT_OF_WORK } from '../../../tokens/form/intake-unit-of-work.token.js';

/** Supplies the transaction port each intake operation owns. */
function withIntakeUnitOfWork<T>(operation: new (work: IntakeUnitOfWork) => T): FactoryProvider<T> {
  return {
    provide: operation,
    inject: [INTAKE_UNIT_OF_WORK],
    useFactory: (work: IntakeUnitOfWork): T => new operation(work),
  };
}

/** Supplies a current clock reading for draft deadline checks. */
function withIntakeClock<T>(
  operation: new (work: IntakeUnitOfWork, now: () => Date) => T,
): FactoryProvider<T> {
  return {
    provide: operation,
    inject: [INTAKE_UNIT_OF_WORK],
    useFactory: (work: IntakeUnitOfWork): T => new operation(work, () => new Date()),
  };
}

/** Binds the intake management, submission and contact use cases. */
export const intakeUseCaseProviders = [
  withIntakeUnitOfWork(GetIntakeForm),
  withIntakeUnitOfWork(UpdateIntakeForm),
  withIntakeUnitOfWork(PublishIntakeForm),
  withIntakeUnitOfWork(DisableIntakeForm),
  withIntakeUnitOfWork(GetPublicIntakeForm),
  withIntakeUnitOfWork(SubmitIntakeForm),
  withIntakeUnitOfWork(GetIntakeContact),
  withIntakeClock(AllocateIntakeAttachment),
  withIntakeClock(ResolveIntakeAttachment),
  withIntakeClock(ReleaseIntakeAttachment),
];
