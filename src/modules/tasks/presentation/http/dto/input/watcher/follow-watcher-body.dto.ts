import { FollowTaskWatcherInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validates that the subscribe body is exactly the empty JSON object. */
export class FollowWatcherBody extends zodDto(FollowTaskWatcherInternalBody) {}
