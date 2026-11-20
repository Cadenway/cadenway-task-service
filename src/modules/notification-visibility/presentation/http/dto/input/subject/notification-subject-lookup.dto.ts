import { ResolveNotificationSubjectsInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Bounded subject lookup validated by the published internal contract. */
export class NotificationSubjectLookupDto extends zodDto(ResolveNotificationSubjectsInternalBody) {}
