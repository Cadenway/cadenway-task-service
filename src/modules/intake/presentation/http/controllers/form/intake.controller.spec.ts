import 'reflect-metadata';

import { runWithOrganizationContext } from '@cadenway/nest-common';
import type { OrganizationContext } from '@cadenway/nest-common';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { AllocateIntakeAttachment } from '../../../../application/use-cases/commands/attachment/allocate-intake-attachment/allocate-intake-attachment.use-case.js';
import type { ReleaseIntakeAttachment } from '../../../../application/use-cases/commands/attachment/release-intake-attachment/release-intake-attachment.use-case.js';
import type { ResolveIntakeAttachment } from '../../../../application/use-cases/queries/attachment/resolve-intake-attachment/resolve-intake-attachment.use-case.js';
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
    for (const name of ['publicForm', 'submit', 'allocate', 'resolve', 'release']) {
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
      {} as AllocateIntakeAttachment,
      {} as ResolveIntakeAttachment,
      {} as ReleaseIntakeAttachment,
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
    const attachmentId = '019a7004-3b2c-7d4e-8f5a-6b7c8d9e0f15';
    const withDraft = {
      ...request,
      headers: { ...request.headers, 'intake-draft-key': key },
    } as unknown as Request;
    await expect(
      runWithOrganizationContext(applicant, () =>
        controller.submit({ publicKey: key }, { title: 'Demande' }, undefined, withDraft),
      ),
    ).rejects.toMatchObject({
      problem: { status: 400, details: { issues: [{ path: 'Idempotency-Key' }] } },
    });
    await expect(
      runWithOrganizationContext(applicant, () =>
        controller.submit(
          { publicKey: key },
          { title: 'Demande', attachmentIds: [attachmentId] },
          'replay-key',
          request,
        ),
      ),
    ).rejects.toMatchObject({
      problem: { status: 400, details: { issues: [{ path: 'Intake-Draft-Key' }] } },
    });
    await runWithOrganizationContext(applicant, () =>
      controller.submit(
        { publicKey: key },
        { title: 'Demande', attachmentIds: [attachmentId] },
        'replay-key',
        withDraft,
      ),
    );
    expect(execute.mock.calls[1]?.[0]).toMatchObject({
      draftKey: key,
      submission: { title: 'Demande', attachmentIds: [attachmentId] },
    });
    expect(execute.mock.calls[1]?.[0].fingerprint).not.toBe(submitted?.fingerprint);
  });

  it('binds allocations to the validated applicant draft and returns only the trusted scope', async () => {
    const attachmentId = '019a7004-3b2c-7d4e-8f5a-6b7c8d9e0f15';
    const allocation = {
      organizationId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30',
      publicationId: '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f12',
      attachmentId,
      expiresAt: new Date('2026-11-20T14:30:00.000Z'),
    };
    const allocate = vi.fn().mockResolvedValue({ ...allocation, privateData: 'hidden' });
    const resolve = vi.fn().mockResolvedValue(allocation);
    const release = vi.fn().mockResolvedValue(undefined);
    const controller = new IntakeController(
      {} as GetIntakeForm,
      {} as UpdateIntakeForm,
      {} as PublishIntakeForm,
      {} as DisableIntakeForm,
      {} as GetIntakeContact,
      {} as GetPublicIntakeForm,
      {} as SubmitIntakeForm,
      { execute: allocate } as unknown as AllocateIntakeAttachment,
      { execute: resolve } as unknown as ResolveIntakeAttachment,
      { execute: release } as unknown as ReleaseIntakeAttachment,
    );
    const request = {
      headers: { 'content-length': '80', 'intake-draft-key': key, 'idempotency-key': 'request' },
      is: () => 'application/json',
    } as unknown as Request;
    const setHeader = vi.fn();
    const response = { setHeader } as unknown as Response;
    const declaration = { fileName: 'capture.png', contentType: 'image/png', sizeBytes: 100 };
    const result = await runWithOrganizationContext(applicant, () =>
      controller.allocate({ publicKey: key }, declaration, request, response),
    );
    expect(result).toEqual({ ...allocation, expiresAt: '2026-11-20T14:30:00.000Z' });
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(setHeader).toHaveBeenCalledWith('Location', `attachments/${attachmentId}`);
    expect(allocate).toHaveBeenCalledWith({
      publicKey: key,
      draftKey: key,
      idempotencyKey: 'request',
      declaration,
    });
    const path = { publicKey: key, attachmentId: attachmentId.toUpperCase() };
    await runWithOrganizationContext(applicant, () => controller.resolve(path, request, response));
    await runWithOrganizationContext(applicant, () => controller.release(path, request, response));
    expect(resolve).toHaveBeenCalledWith({ publicKey: key, draftKey: key, attachmentId });
    expect(release).toHaveBeenCalledWith({ publicKey: key, draftKey: key, attachmentId });
    await expect(
      runWithOrganizationContext(applicant, () =>
        controller.allocate(
          { publicKey: key },
          declaration,
          { ...request, headers: { 'content-length': '80' } } as unknown as Request,
          response,
        ),
      ),
    ).rejects.toMatchObject({ problem: { status: 400 } });
  });
});
