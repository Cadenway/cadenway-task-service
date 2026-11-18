import { ProblemException, runWithOrganizationContext } from '@cadenway/nest-common';
import type { InternalActor, OrganizationContext } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import { toCaller } from './caller.mapper.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** Account of Hugo Dubois (HD), a member of Atelier Nord. */
const HUGO = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32';

/**
 * Builds the context the guards of `@cadenway/nest-common` set from a verified internal token.
 *
 * @param overrides - Fields to replace.
 * @returns The context of Hugo Dubois in Atelier Nord.
 */
function contextOf(overrides: Partial<OrganizationContext> = {}): OrganizationContext {
  return {
    organizationId: ATELIER_NORD,
    actor: { type: 'user', id: HUGO },
    role: null,
    scopes: ['tasks:write'],
    ...overrides,
  };
}

/**
 * Builds the context of an actor.
 *
 * @param actor - The actor.
 * @returns The context.
 */
function actedBy(actor: InternalActor): OrganizationContext {
  return contextOf({ actor });
}

/**
 * Runs `toCaller` in a context and returns the problem it refuses with.
 *
 * @param context - The context.
 * @returns The status and the code of the problem.
 */
function refusalIn(context: OrganizationContext): { status: number; code: string } {
  try {
    runWithOrganizationContext(context, toCaller);
  } catch (error: unknown) {
    if (error instanceof ProblemException) {
      return { status: error.problem.status, code: error.problem.code };
    }
    throw error;
  }
  throw new Error('toCaller was expected to refuse.');
}

describe('toCaller: the caller is the organization and the user of the verified token', () => {
  it('reads the organization and the account of Hugo Dubois from the context', () => {
    expect(runWithOrganizationContext(contextOf(), toCaller)).toEqual({
      organizationId: ATELIER_NORD,
      actorUserId: HUGO,
    });
  });

  it('lower-cases an upper-case account and organization, the form the use cases compare with', () => {
    const caller = runWithOrganizationContext(
      contextOf({
        organizationId: ATELIER_NORD.toUpperCase(),
        actor: { type: 'user', id: HUGO.toUpperCase() },
      }),
      toCaller,
    );

    expect(caller).toEqual({ organizationId: ATELIER_NORD, actorUserId: HUGO });
  });

  it('keeps a mixed-case account to its lower-case form', () => {
    const mixed = '019A5F3C-8d2e-7C4a-9B1f-3E5d7A9c1B32';

    expect(
      runWithOrganizationContext(actedBy({ type: 'user', id: mixed }), toCaller).actorUserId,
    ).toBe(HUGO);
  });
});

describe('toCaller: an actor the route does not accept is refused with 403 auth.actor-not-allowed', () => {
  it.each([
    'hugo',
    'not-a-uuid',
    '',
    '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b3',
    `${HUGO}0`,
    ` ${HUGO}`,
  ])('refuses the account id "%s", which is not a UUID', (id: string) => {
    expect(refusalIn(actedBy({ type: 'user', id }))).toEqual({
      status: 403,
      code: 'auth.actor-not-allowed',
    });
  });

  it('refuses a user actor with no account id', () => {
    expect(refusalIn(actedBy({ type: 'user', id: null }))).toEqual({
      status: 403,
      code: 'auth.actor-not-allowed',
    });
  });

  it.each(['automation', 'git', 'system', 'anonymous'] as const)(
    'refuses the %s actor, even with a UUID',
    (type) => {
      expect(refusalIn(actedBy({ type, id: HUGO }))).toEqual({
        status: 403,
        code: 'auth.actor-not-allowed',
      });
    },
  );

  it('refuses a request that runs with no organization context', () => {
    try {
      toCaller();
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ProblemException);
      expect(error).toMatchObject({ problem: { status: 403, code: 'auth.actor-not-allowed' } });
      return;
    }
    throw new Error('toCaller was expected to refuse.');
  });
});

describe('toCaller: a token with no organization is refused with 403 auth.organization-required', () => {
  it('refuses a context with no organization', () => {
    expect(refusalIn(contextOf({ organizationId: null }))).toEqual({
      status: 403,
      code: 'auth.organization-required',
    });
  });

  it('answers the actor first when both the actor and the organization are wrong', () => {
    expect(
      refusalIn(contextOf({ organizationId: null, actor: { type: 'user', id: 'hugo' } })),
    ).toEqual({ status: 403, code: 'auth.actor-not-allowed' });
  });
});
