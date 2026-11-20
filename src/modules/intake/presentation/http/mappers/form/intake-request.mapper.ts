import { getOrganizationContext, ProblemException } from '@cadenway/nest-common';
import { createHash } from 'node:crypto';

/** Reads the authenticated member and tenant from the verified internal token. */
export function intakeCaller(): { readonly organizationId: string; readonly actorUserId: string } {
  const context = getOrganizationContext();
  if (
    context?.actor.type !== 'user' ||
    context.actor.id === null ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(context.actor.id)
  ) {
    throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
  }
  if (context.organizationId === null) {
    throw new ProblemException({ status: 403, code: 'auth.organization-required' });
  }
  return {
    organizationId: context.organizationId.toLowerCase(),
    actorUserId: context.actor.id.toLowerCase(),
  };
}

/** Refuses applicant requests that carry a tenant in their verified system token. */
export function requireUnscopedApplicant(): void {
  const context = getOrganizationContext();
  if (context?.actor.type !== 'system' || context.organizationId !== null) {
    throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
  }
}

/** Parses one strong numeric entity tag, preserving a stale out-of-range tag as a mismatch. */
export function intakeVersion(header: string | undefined, required: boolean): number | undefined {
  if (header === undefined && !required) return undefined;
  if (header === undefined || !/^"[1-9][0-9]*"$/.test(header)) {
    throw new ProblemException({
      status: 400,
      code: 'request.invalid',
      details: {
        issues: [
          {
            in: 'header',
            path: 'If-Match',
            code: header === undefined ? 'invalid_type' : 'invalid_format',
            message: 'Expected a strong version ETag.',
          },
        ],
      },
    });
  }
  const version = Number(header.slice(1, -1));
  return Number.isSafeInteger(version) ? version : -1;
}

/** Fingerprints the parsed submission without retaining contact data in the receipt. */
export function submissionFingerprint(body: Readonly<Record<string, unknown>>): string {
  const canonical = Object.fromEntries(
    Object.entries(body).sort(([left], [right]) => left.localeCompare(right)),
  );
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}
