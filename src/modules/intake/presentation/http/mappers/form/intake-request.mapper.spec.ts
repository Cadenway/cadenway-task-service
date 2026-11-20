import { runWithOrganizationContext } from '@cadenway/nest-common';
import type { OrganizationContext } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import {
  intakeCaller,
  intakeVersion,
  requireUnscopedApplicant,
  submissionFingerprint,
} from './intake-request.mapper.js';

const organizationId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const userId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';
const context: OrganizationContext = {
  organizationId,
  actor: { type: 'user', id: userId },
  role: null,
  scopes: [],
};

describe('intake request mapping', () => {
  it('uses only the verified member and tenant', () => {
    expect(runWithOrganizationContext(context, intakeCaller)).toEqual({
      organizationId,
      actorUserId: userId,
    });
    expect(() =>
      runWithOrganizationContext(
        { ...context, actor: { type: 'user', id: 'invalid' } },
        intakeCaller,
      ),
    ).toThrow();
  });

  it('only accepts an unscoped verified system actor for applicant operations', () => {
    expect(() => {
      runWithOrganizationContext(context, requireUnscopedApplicant);
    }).toThrow();
    expect(() => {
      runWithOrganizationContext(
        { ...context, actor: { type: 'system', id: 'api-gateway' } },
        requireUnscopedApplicant,
      );
    }).toThrow();
    expect(() => {
      runWithOrganizationContext(
        { ...context, organizationId: null, actor: { type: 'system', id: 'api-gateway' } },
        requireUnscopedApplicant,
      );
    }).not.toThrow();
  });

  it('requires a strong version while retaining valid out-of-range versions as mismatches', () => {
    expect(intakeVersion('"12"', true)).toBe(12);
    expect(intakeVersion(undefined, false)).toBeUndefined();
    expect(intakeVersion('"99999999999999999999999"', true)).toBe(-1);
    for (const value of [undefined, '*', 'W/"1"', '"0"', '"1","2"']) {
      expect(() => intakeVersion(value, true)).toThrow();
    }
  });

  it('fingerprints canonical parsed field ordering and distinguishes changed contact', () => {
    expect(submissionFingerprint({ title: 'A', contactEmail: 'a@example.com' })).toBe(
      submissionFingerprint({ contactEmail: 'a@example.com', title: 'A' }),
    );
    expect(submissionFingerprint({ title: 'A' })).not.toBe(
      submissionFingerprint({ title: 'A', contactEmail: 'a@example.com' }),
    );
  });

  it('binds selected files to the draft while normalizing UUID order and case', () => {
    const a = '019a7004-3b2c-7d4e-8f5a-6b7c8d9e0f15';
    const b = '019a7004-3b2c-7d4e-8f5a-6b7c8d9e0f16';
    const first = { title: 'Demande', attachmentIds: [a.toUpperCase(), b] };
    const reordered = { title: 'Demande', attachmentIds: [b.toUpperCase(), a] };
    expect(submissionFingerprint(first, 'a'.repeat(43))).toBe(
      submissionFingerprint(reordered, 'a'.repeat(43)),
    );
    expect(submissionFingerprint(first, 'a'.repeat(43))).not.toBe(
      submissionFingerprint(reordered, 'b'.repeat(43)),
    );
    expect(submissionFingerprint({ title: 'Demande' }, 'a'.repeat(43))).not.toBe(
      submissionFingerprint({ title: 'Demande' }),
    );
    expect(submissionFingerprint({ title: 'Demande' }, 'a'.repeat(43))).not.toBe(
      submissionFingerprint({ title: 'Demande' }, 'b'.repeat(43)),
    );
    expect(submissionFingerprint({ title: 'Demande' }, 'a'.repeat(43))).toBe(
      submissionFingerprint({ title: 'Demande', attachmentIds: [] }, 'a'.repeat(43)),
    );
  });
});
