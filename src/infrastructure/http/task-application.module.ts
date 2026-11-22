import {
  createApplication,
  InternalTokenGuard,
  InternalTokenVerifier,
} from '@cadenway/nest-common';
import type {
  CreateApplicationOptions,
  InternalPrincipal,
  InternalTokenVerifierOptions,
} from '@cadenway/nest-common';
import { Module } from '@nestjs/common';
import type { DynamicModule, Type } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

interface TaskApplicationOptions extends Omit<
  CreateApplicationOptions,
  'internalToken' | 'internalTokenVerification'
> {
  // #region Properties
  /** The signature verifier configuration for incoming internal calls. */
  readonly internalToken: { readonly verifier: InternalTokenVerifierOptions };
  // #endregion
}

/** Hosts the guard responsible for verifying and attaching the Task HTTP principal. */
@Module({})
class TaskHttpAuthenticationModule {}

/** Registers the kit guard with canonical organization IDs before the principal is attached. */
export function createTaskApplication(
  applicationModule: Type<unknown> | DynamicModule,
  options: TaskApplicationOptions,
): Promise<NestExpressApplication> {
  const { internalToken, ...applicationOptions } = options;
  return createApplication(
    {
      module: TaskHttpAuthenticationModule,
      imports: [applicationModule],
      providers: [
        {
          provide: APP_GUARD,
          inject: [Reflector],
          useFactory: async (reflector: Reflector): Promise<InternalTokenGuard> => {
            const verifier = await InternalTokenVerifier.create(internalToken.verifier);
            const verify = verifier.verify.bind(verifier);
            verifier.verify = async (token: string): Promise<InternalPrincipal> => {
              const principal = await verify(token);
              const organizationId = principal.organizationId?.toLowerCase() ?? null;
              return organizationId === principal.organizationId
                ? principal
                : Object.freeze({ ...principal, organizationId });
            };
            return new InternalTokenGuard(verifier, reflector);
          },
        },
      ],
    },
    // This module supplies the kit guard with its canonicalized verifier.
    { ...applicationOptions, internalTokenVerification: 'off' },
  );
}
