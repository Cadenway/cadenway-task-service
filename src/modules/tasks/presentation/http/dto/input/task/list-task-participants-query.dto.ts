import { ListTaskParticipantsInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Published pagination parameters for the participant list. */
export class ListTaskParticipantsQuery extends zodDto(ListTaskParticipantsInternalQueryParams) {}
