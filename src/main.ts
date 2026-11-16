import { createApplication, loadConfig, runApplication } from '@cadenway/nest-common';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule, TaskOutboxRelayModule } from './app.module.js';
import { appConfigSchema } from './config/app-config.js';
import type { AppConfig } from './config/app-config.js';
import { processRoleSchema, runtimeConfigSchema } from './config/runtime-config.js';

// Started after the instrumentation hooks and `telemetry.js`, with the heap capped for the 256M
// container: `node --max-old-space-size=160 --import @cadenway/nest-common/register
// --import ./dist/telemetry.js dist/main.js` (the Dockerfile CMD and `pnpm start:dev`).
//
// `runApplication` turns a failed start-up (an invalid environment, NATS without the EVENTS stream,
// a port in use) into one JSON line on the standard error and exit code 1. API routes require an
// internal token whose `aud` is INTERNAL_TOKEN_AUDIENCE and whose signature verifies with a trusted
// issuer key. The outbox companion only listens for health probes on loopback.
await runApplication({ service: 'task-service' }, async (): Promise<void> => {
  if (loadConfig(processRoleSchema).TASK_SERVICE_ROLE === 'outbox-relay') {
    const config = loadConfig(runtimeConfigSchema);
    const app: NestExpressApplication = await createApplication(TaskOutboxRelayModule, {
      service: 'task-service-relay',
      config,
      internalTokenVerification: 'off',
    });
    await app.listen(config.PORT, '127.0.0.1');
    return;
  }

  const config: Readonly<AppConfig> = loadConfig(appConfigSchema);
  const app: NestExpressApplication = await createApplication(
    AppModule.forOutboxMode(config.TASK_SERVICE_OUTBOX_MODE),
    {
      service: 'task-service',
      config,
      internalToken: {
        verifier: {
          audience: config.INTERNAL_TOKEN_AUDIENCE,
          trustedIssuers: config.INTERNAL_TOKEN_TRUSTED_ISSUERS,
        },
      },
    },
  );
  await app.listen(config.PORT);
});
