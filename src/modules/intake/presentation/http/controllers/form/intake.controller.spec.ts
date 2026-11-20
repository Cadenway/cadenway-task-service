import 'reflect-metadata';

import { runWithOrganizationContext } from '@cadenway/nest-common';
import type { OrganizationContext } from '@cadenway/nest-common';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { DisableIntakeForm } from '../../../../application/use-cases/commands/form/disable-intake-form/disable-intake-form.use-case.js';
import type { PublishIntakeForm } from '../../../../application/use-cases/commands/form/publish-intake-form/publish-intake-form.use-case.js';
import type { SubmitIntakeForm } from '../../../../application/use-cases/commands/form/submit-intake-form/submit-intake-form.use-case.js';
import type { SubmitIntakeFormInput } from '../../../../application/use-cases/commands/form/submit-intake-form/submit-intake-form.input.js';
import type { UpdateIntakeForm } from '../../../../application/use-cases/commands/form/update-intake-form/update-intake-form.use-case.js';
import type { GetIntakeContact } from '../../../../application/use-cases/queries/form/get-intake-contact/get-intake-contact.use-case.js';
import type { GetIntakeForm } from '../../../../application/use-cases/queries/form/get-intake-form/get-intake-form.use-case.js';
import type { GetPublicIntakeForm } from '../../../../application/use-cases/queries/form/get-public-intake-form/get-public-intake-form.use-case.js';
import { IntakeController } from './intake.controller.js';

const applicant: OrganizationContext = {
  organizationId: null,
  actor: { type: 'system', id: 'api-gateway' },
  role: null,
  scopes: [],
};
const key = 'x'.repeat(43);

describe('internal intake controller', () => {
  it('limits management to users and applicant routes to the verified gateway system actor', () => {
    expect(Reflect.getMetadata('cadenway:internal-access', IntakeController)).toEqual({
      issuers: ['api-gateway'],
      actors: ['user'],
      organization: 'required',
    });
    for (const name of ['publicForm', 'submit']) {
      const method = Object.getOwnPropertyDescriptor(IntakeController.prototype, name)
        ?.value as object;
      expect(Reflect.getMetadata('cadenway:internal-access', method)).toEqual({
        actors: ['system'],
        organization: 'optional',
      });
    }
  });

  it('submits through the scoped use case and strips uncontracted response properties', async () => {
    const execute = vi
      .fn<(input: SubmitIntakeFormInput) => Promise<{ receipt: string }>>()
      .mockResolvedValue({ receipt: 'x'.repeat(43), privateData: 'hidden' } as { receipt: string });
    const controller = new IntakeController(
      {} as GetIntakeForm,
      {} as UpdateIntakeForm,
      {} as PublishIntakeForm,
      {} as DisableIntakeForm,
      {} as GetIntakeContact,
      {} as GetPublicIntakeForm,
      { execute } as unknown as SubmitIntakeForm,
    );
    const request = {
      headers: { 'content-length': '50' },
      is: () => 'application/json',
    } as unknown as Request;
    const response = await runWithOrganizationContext(applicant, () =>
      controller.submit({ publicKey: key }, { title: 'Demande' }, 'replay-key', request),
    );
    expect(response).toEqual({ receipt: 'x'.repeat(43) });
    const submitted = execute.mock.calls[0]?.[0];
    expect(submitted).toMatchObject({
      publicKey: key,
      submission: { title: 'Demande' },
      idempotencyKey: 'replay-key',
    });
    expect(submitted?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    await expect(
      runWithOrganizationContext(
        { ...applicant, organizationId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30' },
        () => controller.submit({ publicKey: key }, { title: 'Demande' }, undefined, request),
      ),
    ).rejects.toMatchObject({ problem: { status: 403, code: 'auth.actor-not-allowed' } });
    await expect(
      runWithOrganizationContext(applicant, () =>
        controller.submit({ publicKey: key }, { title: 'Demande' }, '', request),
      ),
    ).rejects.toMatchObject({
      problem: {
        status: 400,
        code: 'request.invalid',
        details: { issues: [{ in: 'header', path: 'Idempotency-Key' }] },
      },
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
