import { ListSpaceMilestonesInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Parameters of the space milestone route. */
export class SpaceMilestonesPath extends zodDto(ListSpaceMilestonesInternalParams) {}
