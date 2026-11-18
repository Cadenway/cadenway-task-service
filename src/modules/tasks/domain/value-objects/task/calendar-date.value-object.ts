import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';

/**
 * Constant datePattern
 *
 * @description
 * Shape of a calendar date (`format: date` of `dueDate` and `startDate`,
 * `openapi/internal/task-service.yaml:2196-2207`): `YYYY-MM-DD` with ASCII digits.
 *
 * @type {RegExp}
 */
const datePattern: RegExp = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Constant firstDay
 *
 * @description
 * Day number of 0001-01-01, the first date a task accepts (year 0001 at least,
 * `openapi/internal/task-service.yaml:2196`).
 *
 * @type {number}
 */
const firstDay: number = daysFromCivil(1, 1, 1);

/**
 * Constant lastDay
 *
 * @description
 * Day number of 9999-12-31, the last date four digits of a year can write.
 *
 * @type {number}
 */
const lastDay: number = daysFromCivil(9999, 12, 31);

/**
 * Function daysFromCivil
 *
 * @description
 * Number of days from 1970-01-01 to a date of the proleptic Gregorian calendar, by integer
 * arithmetic only (the "days from civil" algorithm of Howard Hinnant), so that no time zone and no
 * clock take part.
 *
 * @param {number} year - The year.
 * @param {number} month - The month, 1 to 12.
 * @param {number} day - The day of the month.
 * @returns {number} The day number, negative before 1970-01-01.
 */
function daysFromCivil(year: number, month: number, day: number): number {
  const shifted: number = month <= 2 ? year - 1 : year;
  const era: number = Math.floor(shifted / 400);
  const yearOfEra: number = shifted - era * 400;
  const monthFromMarch: number = (month + 9) % 12;
  const dayOfYear: number = Math.floor((153 * monthFromMarch + 2) / 5) + day - 1;
  const dayOfEra: number =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

/**
 * Function pad
 *
 * @description
 * Writes a number with leading zeros.
 *
 * @param {number} value - A non-negative integer.
 * @param {number} width - The number of digits.
 * @returns {string} The digits.
 */
function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * Function isLeapYear
 *
 * @description
 * Whether a year of the proleptic Gregorian calendar has a 29 February.
 *
 * @param {number} year - The year.
 * @returns {boolean} Whether it is a leap year.
 */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Class CalendarDate
 *
 * @description
 * A calendar date `YYYY-MM-DD` of a due date or a start date ("Due dates and start dates are
 * calendar dates", `openapi/public/tasks.yaml:54-55`), from 0001-01-01 to 9999-12-31, with day
 * arithmetic that knows no time zone: the shift of a start when the due date moves
 * (`openapi/public/tasks.yaml:430-432`) counts whole days, leap years included. The stored and
 * transmitted form stays the text; this class reads and computes it.
 */
export class CalendarDate {
  // #region Properties
  /**
   * Property day
   *
   * @description
   * Number of days from 1970-01-01.
   *
   * @type {number}
   * @readonly
   */
  private readonly day: number;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Keeps a day number within 0001-01-01 and 9999-12-31.
   *
   * @param {number} day - The checked day number.
   * @constructor
   */
  private constructor(day: number) {
    this.day = day;
    Object.freeze(this);
  }
  // #endregion

  // #region Methods
  /**
   * Method isCalendarDate
   *
   * @description
   * Whether a text is a real date `YYYY-MM-DD` from 0001-01-01: a month 1 to 12 and a day that
   * exists in it, 29 February only in a leap year. The year 0000 is refused, as the boundary
   * refuses it.
   *
   * @param {string} text - The text.
   * @returns {boolean} Whether it is a calendar date.
   */
  public static isCalendarDate(text: string): boolean {
    const match: RegExpExecArray | null = datePattern.exec(text);
    if (match === null) {
      return false;
    }
    const year: number = Number(match[1]);
    const month: number = Number(match[2]);
    const day: number = Number(match[3]);
    if (year < 1 || month < 1 || month > 12 || day < 1) {
      return false;
    }
    if (month === 2) {
      return day <= (isLeapYear(year) ? 29 : 28);
    }
    return day <= ([4, 6, 9, 11].includes(month) ? 30 : 31);
  }

  /**
   * Method parse
   *
   * @description
   * Reads a calendar date.
   *
   * @param {string} text - The date, as `2026-11-12`.
   * @returns {CalendarDate} The date.
   * @throws {InvalidTaskError} When the text is not a calendar date from 0001-01-01.
   */
  public static parse(text: string): CalendarDate {
    if (!CalendarDate.isCalendarDate(text)) {
      throw new InvalidTaskError('a date is a calendar date YYYY-MM-DD from 0001-01-01');
    }
    return new CalendarDate(
      daysFromCivil(Number(text.slice(0, 4)), Number(text.slice(5, 7)), Number(text.slice(8, 10))),
    );
  }

  /**
   * Method plusDays
   *
   * @description
   * The date a whole number of days later, or earlier for a negative number.
   *
   * @param {number} days - The number of days, an integer.
   * @returns {CalendarDate | null} The date, or `null` when it would be before 0001-01-01 or after
   * 9999-12-31.
   * @throws {InvalidTaskError} When `days` is not a safe integer.
   */
  public plusDays(days: number): CalendarDate | null {
    if (!Number.isSafeInteger(days)) {
      throw new InvalidTaskError('a number of days is an integer');
    }
    const day: number = this.day + days;
    if (day < firstDay || day > lastDay) {
      return null;
    }
    return new CalendarDate(day);
  }

  /**
   * Method daysUntil
   *
   * @description
   * The number of days from this date to another.
   *
   * @param {CalendarDate} other - The other date.
   * @returns {number} Positive when `other` is later, negative when it is earlier, 0 when equal.
   */
  public daysUntil(other: CalendarDate): number {
    return other.day - this.day;
  }

  /**
   * Method format
   *
   * @description
   * The date as stored and transmitted (the "civil from days" algorithm of Howard Hinnant).
   *
   * @returns {string} The date `YYYY-MM-DD`.
   */
  public format(): string {
    const shifted: number = this.day + 719_468;
    const era: number = Math.floor(shifted / 146_097);
    const dayOfEra: number = shifted - era * 146_097;
    const yearOfEra: number = Math.floor(
      (dayOfEra -
        Math.floor(dayOfEra / 1460) +
        Math.floor(dayOfEra / 36_524) -
        Math.floor(dayOfEra / 146_096)) /
        365,
    );
    const dayOfYear: number =
      dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
    const monthFromMarch: number = Math.floor((5 * dayOfYear + 2) / 153);
    const day: number = dayOfYear - Math.floor((153 * monthFromMarch + 2) / 5) + 1;
    const month: number = monthFromMarch < 10 ? monthFromMarch + 3 : monthFromMarch - 9;
    const year: number = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
    return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  }
  // #endregion
}
