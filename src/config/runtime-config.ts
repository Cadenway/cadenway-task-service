import { baseConfigShape } from '@cadenway/nest-common';
import { databaseConfigShape } from '@cadenway/nest-common/database';
import { messagingConfigShape } from '@cadenway/nest-messaging';
import { z } from 'zod';

/** The environment shared by both Task process roles. */
export const runtimeConfigSchema = z.object({
  ...baseConfigShape,
  ...databaseConfigShape,
  ...messagingConfigShape,
});

/** Database, messaging and process settings supplied by the application environment. */
export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

/** Selects the Nest composition to bootstrap without needing its configuration first. */
export const processRoleSchema = z.object({
  TASK_SERVICE_ROLE: z.enum(['api', 'outbox-relay']).default('api'),
});
