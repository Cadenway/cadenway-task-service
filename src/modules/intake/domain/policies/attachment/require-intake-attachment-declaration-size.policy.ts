import { IntakeAttachmentError } from '../../errors/attachment/intake-attachment.error.js';

const MAX_INTAKE_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;

/** Enforces the positive, 25 MiB maximum declaration in the P4 reservation contract. */
export function requireIntakeAttachmentDeclarationSize(sizeBytes: number): void {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1) {
    throw new IntakeAttachmentError('invalid-declaration');
  }
  if (sizeBytes > MAX_INTAKE_ATTACHMENT_SIZE_BYTES) {
    throw new IntakeAttachmentError('file-too-large');
  }
}
