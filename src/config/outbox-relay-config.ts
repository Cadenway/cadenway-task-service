import { baseConfigShape } from '@cadenway/nest-common';
import { databaseConfigShape } from '@cadenway/nest-common/database';
import { messagingConfigShape } from '@cadenway/nest-messaging';
import { z } from 'zod';

/** Worker configuration without the API's signing, verification or job settings. */
export const outboxRelayConfigSchema = z.object({
  ...baseConfigShape,
  ...databaseConfigShape,
  ...messagingConfigShape,
});

/** Environment available to the independently started outbox relay. */
export type OutboxRelayConfig = z.infer<typeof outboxRelayConfigSchema>;

/** Selects the composition before the selected process validates its own settings. */
export const taskProcessRoleSchema = z.object({
  TASK_SERVICE_ROLE: z.enum(['api', 'outbox-relay']).default('api'),
});
