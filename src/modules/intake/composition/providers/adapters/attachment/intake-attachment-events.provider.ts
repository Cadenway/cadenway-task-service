import { EventConsumers } from '@cadenway/nest-messaging';
import type { FactoryProvider } from '@nestjs/common';

import type { IntakeUnitOfWork } from '../../../../application/ports/outbound/transactions/form/intake-unit-of-work.port.js';
import { VerifyIntakeAttachment } from '../../../../application/use-cases/commands/attachment/verify-intake-attachment/verify-intake-attachment.use-case.js';
import { VerifyIntakeAttachmentHandler } from '../../../../presentation/messaging/handlers/attachment/verify-intake-attachment.handler.js';
import { INTAKE_UNIT_OF_WORK } from '../../../tokens/form/intake-unit-of-work.token.js';

/** Connects retained Storage facts to the already scoped Intake transaction. */
export const intakeAttachmentEventProviders: readonly FactoryProvider[] = [
  {
    provide: VerifyIntakeAttachment,
    inject: [INTAKE_UNIT_OF_WORK],
    useFactory: (work: IntakeUnitOfWork): VerifyIntakeAttachment =>
      new VerifyIntakeAttachment(work, () => new Date()),
  },
  {
    provide: VerifyIntakeAttachmentHandler,
    inject: [EventConsumers, VerifyIntakeAttachment],
    useFactory: (
      consumers: EventConsumers,
      verification: VerifyIntakeAttachment,
    ): VerifyIntakeAttachmentHandler => new VerifyIntakeAttachmentHandler(consumers, verification),
  },
];
