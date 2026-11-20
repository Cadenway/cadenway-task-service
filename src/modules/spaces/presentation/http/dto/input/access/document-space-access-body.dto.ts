import { ResolveDocumentSpaceAccessInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validates the bounded, strictly shaped document space access lookup. */
export class DocumentSpaceAccessBody extends zodDto(ResolveDocumentSpaceAccessInternalBody) {}
