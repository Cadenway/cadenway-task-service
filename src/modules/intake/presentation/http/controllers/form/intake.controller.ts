import {
  AllocateIntakeAttachmentInternalBody,
  AllocateIntakeAttachmentInternalHeader,
  AllocateIntakeAttachmentInternalParams,
  AllocateIntakeAttachmentInternalResponse,
  GetIntakeFormConfigurationInternalParams,
  GetIntakeFormConfigurationInternalResponse,
  GetPublicIntakeFormInternalParams,
  GetPublicIntakeFormInternalResponse,
  GetTaskIntakeContactInternalParams,
  GetTaskIntakeContactInternalResponse,
  ReleaseIntakeAttachmentInternalHeader,
  ReleaseIntakeAttachmentInternalParams,
  ResolveIntakeAttachmentInternalHeader,
  ResolveIntakeAttachmentInternalParams,
  ResolveIntakeAttachmentInternalResponse,
  SubmitPublicIntakeFormInternalBody,
  SubmitPublicIntakeFormInternalHeader,
  SubmitPublicIntakeFormInternalResponse,
  UpdateIntakeFormConfigurationInternalBody,
} from '@cadenway/contracts/validators/internal/task-service';
import {
  formatEtag,
  InternalAccess,
  ProblemException,
  ZodValidationPipe,
} from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { z } from 'zod';

import { AllocateIntakeAttachment } from '../../../../application/use-cases/commands/attachment/allocate-intake-attachment/allocate-intake-attachment.use-case.js';
import { ReleaseIntakeAttachment } from '../../../../application/use-cases/commands/attachment/release-intake-attachment/release-intake-attachment.use-case.js';
import { DisableIntakeForm } from '../../../../application/use-cases/commands/form/disable-intake-form/disable-intake-form.use-case.js';
import { PublishIntakeForm } from '../../../../application/use-cases/commands/form/publish-intake-form/publish-intake-form.use-case.js';
import { SubmitIntakeForm } from '../../../../application/use-cases/commands/form/submit-intake-form/submit-intake-form.use-case.js';
import { UpdateIntakeForm } from '../../../../application/use-cases/commands/form/update-intake-form/update-intake-form.use-case.js';
import { GetIntakeContact } from '../../../../application/use-cases/queries/form/get-intake-contact/get-intake-contact.use-case.js';
import { GetIntakeForm } from '../../../../application/use-cases/queries/form/get-intake-form/get-intake-form.use-case.js';
import { GetPublicIntakeForm } from '../../../../application/use-cases/queries/form/get-public-intake-form/get-public-intake-form.use-case.js';
import { ResolveIntakeAttachment } from '../../../../application/use-cases/queries/attachment/resolve-intake-attachment/resolve-intake-attachment.use-case.js';
import { answerIntakeRefusals } from '../../errors/form/intake.problem.js';
import {
  intakeCaller,
  intakeVersion,
  requireUnscopedApplicant,
  submissionFingerprint,
} from '../../mappers/form/intake-request.mapper.js';

/** Rejects text and dates that PostgreSQL cannot represent. */
function storableBody(
  body: {
    readonly title?: string;
    readonly description?: string | null;
    readonly contactEmail?: string;
    readonly dueDate?: string;
  },
  context: z.RefinementCtx,
): void {
  for (const field of ['title', 'description', 'contactEmail'] as const) {
    const value = body[field];
    if (
      typeof value === 'string' &&
      (value.includes('\u0000') ||
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
    ) {
      context.addIssue({ code: 'custom', path: [field], message: 'Expected storable text.' });
    }
  }
  if (body.dueDate?.startsWith('0000-')) {
    context.addIssue({
      code: 'custom',
      path: ['dueDate'],
      message: 'Expected a date from year 0001.',
    });
  }
}

const updateBody = UpdateIntakeFormConfigurationInternalBody.superRefine(storableBody);
const submitBody = SubmitPublicIntakeFormInternalBody.superRefine(storableBody);

/** Rejects missing JSON bodies before an empty patch can be accepted. */
function requireBody(request: Request): void {
  const length = request.headers['content-length'];
  if (
    !request.is('application/json') ||
    Number(length) === 0 ||
    (length === undefined && !request.readableDidRead)
  ) {
    throw new ProblemException({
      status: 400,
      code: 'request.invalid',
      details: {
        issues: [{ in: 'body', path: '', code: 'required', message: 'Expected a JSON body.' }],
      },
    });
  }
}

/** Parses only the declared applicant headers without including their values in a refusal. */
function applicantHeaders<T>(schema: z.ZodType<T>, headers: unknown): T {
  const result = schema.safeParse(headers);
  if (!result.success) {
    throw new ProblemException({
      status: 400,
      code: 'request.invalid',
      details: {
        issues: result.error.issues.map((issue) => ({
          in: 'header',
          path: issue.path.join('.'),
          code: 'invalid',
          message: 'Expected a valid header.',
        })),
      },
    });
  }
  return result.data;
}

/** Authenticated intake configuration and private contact operations. */
@Controller('internal/v1')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class IntakeController {
  // #region Constructor
  /** Binds the intake use cases. */
  public constructor(
    private readonly getForm: GetIntakeForm,
    private readonly updateForm: UpdateIntakeForm,
    private readonly publishForm: PublishIntakeForm,
    private readonly disableForm: DisableIntakeForm,
    private readonly getContact: GetIntakeContact,
    private readonly getPublicForm: GetPublicIntakeForm,
    private readonly submitForm: SubmitIntakeForm,
    private readonly allocateAttachment: AllocateIntakeAttachment,
    private readonly resolveAttachment: ResolveIntakeAttachment,
    private readonly releaseAttachment: ReleaseIntakeAttachment,
  ) {}
  // #endregion

  // #region Methods
  /** Reads and initializes the list's configuration for an authorized editor. */
  @Get('lists/:listId/intake-form')
  public async read(
    @Param(new ZodValidationPipe(GetIntakeFormConfigurationInternalParams))
    path: z.output<typeof GetIntakeFormConfigurationInternalParams>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<z.output<typeof GetIntakeFormConfigurationInternalResponse>> {
    const form = await answerIntakeRefusals(() =>
      this.getForm.execute({ ...intakeCaller(), listId: path.listId.toLowerCase() }),
    );
    response.setHeader('ETag', formatEtag(form.version));
    return GetIntakeFormConfigurationInternalResponse.parse(form);
  }

  /** Updates the draft with its required strong ETag. */
  @Patch('lists/:listId/intake-form')
  public async update(
    @Param(new ZodValidationPipe(GetIntakeFormConfigurationInternalParams))
    path: z.output<typeof GetIntakeFormConfigurationInternalParams>,
    @Body(new ZodValidationPipe(updateBody))
    body: z.output<typeof updateBody>,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<z.output<typeof GetIntakeFormConfigurationInternalResponse>> {
    requireBody(request);
    const expectedVersion = intakeVersion(ifMatch, true);
    if (expectedVersion === undefined) throw new Error('Required intake version was not parsed.');
    const form = await answerIntakeRefusals(() =>
      this.updateForm.execute({
        ...intakeCaller(),
        listId: path.listId.toLowerCase(),
        expectedVersion,
        patch: body,
      }),
    );
    response.setHeader('ETag', formatEtag(form.version));
    return GetIntakeFormConfigurationInternalResponse.parse(form);
  }

  /** Publishes or reuses the current key. */
  @Post('lists/:listId/intake-form/publish')
  @HttpCode(200)
  public async publish(
    @Param(new ZodValidationPipe(GetIntakeFormConfigurationInternalParams))
    path: z.output<typeof GetIntakeFormConfigurationInternalParams>,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<z.output<typeof GetIntakeFormConfigurationInternalResponse>> {
    const expectedVersion = intakeVersion(ifMatch, false);
    const form = await answerIntakeRefusals(() =>
      this.publishForm.execute({
        ...intakeCaller(),
        listId: path.listId.toLowerCase(),
        ...(expectedVersion === undefined ? {} : { expectedVersion }),
      }),
    );
    response.setHeader('ETag', formatEtag(form.version));
    return GetIntakeFormConfigurationInternalResponse.parse(form);
  }

  /** Revokes the active key and retains the configuration. */
  @Delete('lists/:listId/intake-form/publication')
  @HttpCode(204)
  public async disable(
    @Param(new ZodValidationPipe(GetIntakeFormConfigurationInternalParams))
    path: z.output<typeof GetIntakeFormConfigurationInternalParams>,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const expectedVersion = intakeVersion(ifMatch, false);
    const result = await answerIntakeRefusals(() =>
      this.disableForm.execute({
        ...intakeCaller(),
        listId: path.listId.toLowerCase(),
        ...(expectedVersion === undefined ? {} : { expectedVersion }),
      }),
    );
    response.setHeader('ETag', formatEtag(result.version));
  }

  /** Reads private contact data after current task authorization. */
  @Get('tasks/:taskKey/intake-contact')
  public async contact(
    @Param(new ZodValidationPipe(GetTaskIntakeContactInternalParams))
    path: z.output<typeof GetTaskIntakeContactInternalParams>,
  ): Promise<z.output<typeof GetTaskIntakeContactInternalResponse>> {
    const contact = await answerIntakeRefusals(() =>
      this.getContact.execute({ ...intakeCaller(), taskKey: path.taskKey }),
    );
    return GetTaskIntakeContactInternalResponse.parse(contact);
  }

  /** Reads only the applicant-facing fields of a currently active publication. */
  @Get('intake-forms/:publicKey')
  @InternalAccess({ actors: ['system'], organization: 'optional' })
  public async publicForm(
    @Param(new ZodValidationPipe(GetPublicIntakeFormInternalParams))
    path: z.output<typeof GetPublicIntakeFormInternalParams>,
  ): Promise<z.output<typeof GetPublicIntakeFormInternalResponse>> {
    requireUnscopedApplicant();
    const form = await answerIntakeRefusals(() =>
      this.getPublicForm.execute({ publicKey: path.publicKey }),
    );
    return GetPublicIntakeFormInternalResponse.parse(form);
  }

  /** Allocates a private draft reservation for the verified gateway system actor. */
  @Post('intake-forms/:publicKey/attachments')
  @HttpCode(201)
  @InternalAccess({ actors: ['system'], organization: 'optional' })
  public async allocate(
    @Param(new ZodValidationPipe(AllocateIntakeAttachmentInternalParams))
    path: z.output<typeof AllocateIntakeAttachmentInternalParams>,
    @Body(new ZodValidationPipe(AllocateIntakeAttachmentInternalBody))
    body: z.output<typeof AllocateIntakeAttachmentInternalBody>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<z.output<typeof AllocateIntakeAttachmentInternalResponse>> {
    response.setHeader('Cache-Control', 'no-store');
    requireUnscopedApplicant();
    requireBody(request);
    const headers = applicantHeaders(AllocateIntakeAttachmentInternalHeader, {
      'Intake-Draft-Key': request.headers['intake-draft-key'],
      'Idempotency-Key': request.headers['idempotency-key'],
    });
    const allocation = await answerIntakeRefusals(() =>
      this.allocateAttachment.execute({
        publicKey: path.publicKey,
        draftKey: headers['Intake-Draft-Key'],
        idempotencyKey: headers['Idempotency-Key'],
        declaration: body,
      }),
    );
    const result = AllocateIntakeAttachmentInternalResponse.parse({
      organizationId: allocation.organizationId,
      publicationId: allocation.publicationId,
      attachmentId: allocation.attachmentId,
      expiresAt: allocation.expiresAt.toISOString(),
    });
    response.setHeader('Location', `attachments/${result.attachmentId}`);
    return result;
  }

  /** Resolves the scope of an eligible reservation without exposing its draft credential. */
  @Get('intake-forms/:publicKey/attachments/:attachmentId')
  @InternalAccess({ actors: ['system'], organization: 'optional' })
  public async resolve(
    @Param(new ZodValidationPipe(ResolveIntakeAttachmentInternalParams))
    path: z.output<typeof ResolveIntakeAttachmentInternalParams>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<z.output<typeof ResolveIntakeAttachmentInternalResponse>> {
    response.setHeader('Cache-Control', 'no-store');
    requireUnscopedApplicant();
    const headers = applicantHeaders(ResolveIntakeAttachmentInternalHeader, {
      'Intake-Draft-Key': request.headers['intake-draft-key'],
    });
    const allocation = await answerIntakeRefusals(
      () =>
        this.resolveAttachment.execute({
          publicKey: path.publicKey,
          draftKey: headers['Intake-Draft-Key'],
          attachmentId: path.attachmentId.toLowerCase(),
        }),
      true,
    );
    return ResolveIntakeAttachmentInternalResponse.parse({
      organizationId: allocation.organizationId,
      publicationId: allocation.publicationId,
      attachmentId: allocation.attachmentId,
      expiresAt: allocation.expiresAt.toISOString(),
    });
  }

  /** Releases the reservation and its terminal fact in the application transaction. */
  @Delete('intake-forms/:publicKey/attachments/:attachmentId')
  @HttpCode(204)
  @InternalAccess({ actors: ['system'], organization: 'optional' })
  public async release(
    @Param(new ZodValidationPipe(ReleaseIntakeAttachmentInternalParams))
    path: z.output<typeof ReleaseIntakeAttachmentInternalParams>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    requireUnscopedApplicant();
    const headers = applicantHeaders(ReleaseIntakeAttachmentInternalHeader, {
      'Intake-Draft-Key': request.headers['intake-draft-key'],
    });
    await answerIntakeRefusals(
      () =>
        this.releaseAttachment.execute({
          publicKey: path.publicKey,
          draftKey: headers['Intake-Draft-Key'],
          attachmentId: path.attachmentId.toLowerCase(),
        }),
      true,
    );
  }

  /** Creates a request and its scoped idempotency receipt atomically. */
  @Post('intake-forms/:publicKey/submissions')
  @HttpCode(200)
  @InternalAccess({ actors: ['system'], organization: 'optional' })
  public async submit(
    @Param(new ZodValidationPipe(GetPublicIntakeFormInternalParams))
    path: z.output<typeof GetPublicIntakeFormInternalParams>,
    @Body(new ZodValidationPipe(submitBody))
    body: z.output<typeof submitBody>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
  ): Promise<z.output<typeof SubmitPublicIntakeFormInternalResponse>> {
    requireUnscopedApplicant();
    requireBody(request);
    const headers = applicantHeaders(SubmitPublicIntakeFormInternalHeader, {
      'Idempotency-Key': idempotencyKey,
      'Intake-Draft-Key': request.headers['intake-draft-key'],
    });
    if ((body.attachmentIds?.length ?? 0) > 0 && headers['Intake-Draft-Key'] === undefined) {
      throw new ProblemException({
        status: 400,
        code: 'request.invalid',
        details: {
          issues: [
            {
              in: 'header',
              path: 'Intake-Draft-Key',
              code: 'invalid',
              message: 'Expected a draft key for attachments.',
            },
          ],
        },
      });
    }
    if (headers['Intake-Draft-Key'] !== undefined && headers['Idempotency-Key'] === undefined) {
      throw new ProblemException({
        status: 400,
        code: 'request.invalid',
        details: {
          issues: [
            {
              in: 'header',
              path: 'Idempotency-Key',
              code: 'required',
              message: 'Expected an idempotency key for a draft.',
            },
          ],
        },
      });
    }
    const receipt = await answerIntakeRefusals(() =>
      this.submitForm.execute({
        publicKey: path.publicKey,
        submission: body,
        fingerprint: submissionFingerprint(body, headers['Intake-Draft-Key']),
        ...(headers['Intake-Draft-Key'] === undefined
          ? {}
          : { draftKey: headers['Intake-Draft-Key'] }),
        ...(headers['Idempotency-Key'] === undefined
          ? {}
          : { idempotencyKey: headers['Idempotency-Key'] }),
      }),
    );
    return SubmitPublicIntakeFormInternalResponse.parse(receipt);
  }
  // #endregion
}
