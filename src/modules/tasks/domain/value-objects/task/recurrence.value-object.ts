/**
 * Task recurrence cadences from the published contracts. The domain spec checks the literal set
 * against `@cadenway/contracts` without coupling the domain to the package.
 */
export const RECURRENCES: readonly ['none', 'daily', 'weekly', 'biweekly', 'monthly'] =
  Object.freeze(['none', 'daily', 'weekly', 'biweekly', 'monthly']);

/** The cadence of a task, where `none` leaves a completion without a successor. */
export type Recurrence = (typeof RECURRENCES)[number];
