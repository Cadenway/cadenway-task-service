import { InvalidGoalError } from '../../../domain/errors/goal/invalid-goal.error.js';
import { GoalError } from '../../models/goal/goal-error.model.js';

/** Exposes expected domain refusals through the application boundary. */
export function rethrowGoalFailure(error: unknown): never {
  if (error instanceof InvalidGoalError && error.reason !== 'invalid-link-measurement') {
    throw new GoalError({ reason: error.reason });
  }
  throw error;
}
