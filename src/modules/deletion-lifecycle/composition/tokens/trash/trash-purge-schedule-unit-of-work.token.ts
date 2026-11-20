/**
 * Constant TRASH_PURGE_SCHEDULE_UNIT_OF_WORK
 *
 * @description
 * Identifies the `TrashPurgeScheduleUnitOfWork` port of the module, bound to the system
 * transaction runner of the kit and the job producer of `@cadenway/nest-jobs`.
 *
 * @type {unique symbol}
 */
export const TRASH_PURGE_SCHEDULE_UNIT_OF_WORK: unique symbol = Symbol(
  'TrashPurgeScheduleUnitOfWork',
);
