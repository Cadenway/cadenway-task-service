import { FollowTaskWatcherInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validates the task key and account ID shared by both watcher writes. */
export class WatcherPath extends zodDto(FollowTaskWatcherInternalParams) {}
