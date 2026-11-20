import { InvalidGoalError } from '../../errors/goal/invalid-goal.error.js';

/** Calendar quarter in `YYYY-QN` format (`components/goals.yaml`). */
const quarterPattern = /^(?!0000)[0-9]{4}-Q[1-4]$/;

/** ISO calendar date supported by the goal contract. */
const datePattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/** Calendar quarter that fixes the deadline interval and the elapsed progress reference. */
export class GoalQuarter {
  // #region Constructor
  /** Stores the day numbers of the first and last calendar dates of the quarter. */
  private constructor(
    private readonly start: number,
    private readonly end: number,
  ) {}
  // #endregion

  // #region Methods
  /** Reads the calendar quarter defined in `components/goals.yaml`. */
  public static parse(quarter: string): GoalQuarter {
    if (typeof quarter !== 'string' || !quarterPattern.test(quarter)) {
      throw new InvalidGoalError('invalid-quarter', 'the goal quarter has format YYYY-QN');
    }
    const year = Number(quarter.slice(0, 4));
    const lastMonth = Number(quarter.slice(-1)) * 3;
    return new GoalQuarter(
      dayNumber(year, lastMonth - 2, 1),
      dayNumber(year, lastMonth, daysInMonth(year, lastMonth)),
    );
  }

  /** Checks the inclusive due date bound in `openapi/public/goals.yaml`. */
  public requireDueDate(dueDate: string): void {
    const date = parseDate(dueDate);
    if (date < this.start || date > this.end) {
      throw new InvalidGoalError(
        'due-date-outside-quarter',
        'the goal due date is within its quarter',
      );
    }
  }

  /** Measures elapsed progress linearly between the first and last calendar dates (P3c-2). */
  public expectedProgress(today: string): number {
    const date = parseDate(today);
    const elapsed = date - this.start;
    const duration = this.end - this.start;
    return 100 * Math.min(1, Math.max(0, elapsed / duration));
  }
  // #endregion
}

/** Reads a strict calendar date without depending on the local time zone or current time. */
function parseDate(date: string): number {
  if (typeof date !== 'string' || !datePattern.test(date)) {
    throw new InvalidGoalError('invalid-date', 'the goal date has format YYYY-MM-DD');
  }
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new InvalidGoalError('invalid-date', 'the goal date is a calendar date');
  }
  return dayNumber(year, month, day);
}

/** Month length under the Gregorian leap year rules, including century exceptions. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Counts elapsed days from 0001-01-01 in the proleptic Gregorian calendar. */
function dayNumber(year: number, month: number, day: number): number {
  const priorYears = year - 1;
  const leapDays =
    Math.floor(priorYears / 4) - Math.floor(priorYears / 100) + Math.floor(priorYears / 400);
  let elapsedDays = priorYears * 365 + leapDays + day - 1;
  for (let priorMonth = 1; priorMonth < month; priorMonth += 1) {
    elapsedDays += daysInMonth(year, priorMonth);
  }
  return elapsedDays;
}
