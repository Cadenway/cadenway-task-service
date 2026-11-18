import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { MAX_TASK_NUMBER } from './task-limits.value-object.js';

/**
 * Constant keyPattern
 *
 * @description
 * `TaskKey` of `openapi/internal/task-service.yaml:3107-3109`: a prefix of 2 to 5 uppercase letters,
 * a dash, and a number without a leading zero of 1 to 9 digits.
 *
 * @type {RegExp}
 */
const keyPattern: RegExp = /^([A-Z]{2,5})-([1-9][0-9]{0,8})$/;

/**
 * Constant prefixPattern
 *
 * @description
 * `SpacePrefix` of `openapi/internal/task-service.yaml`, the first part of a key.
 *
 * @type {RegExp}
 */
const prefixPattern: RegExp = /^[A-Z]{2,5}$/;

/**
 * Class TaskKey
 *
 * @description
 * Key of a task, as `CAD-482` (`TaskKey` of `openapi/internal/task-service.yaml:3107-3115`;
 * `openapi/public/tasks.yaml:10-13`): the prefix of the space the task was created in and a
 * number from 1 to 999,999,999. A key never changes, also when the task moves to another space or
 * its space changes prefix, and is never given to another task: the spaces module hands out the
 * numbers, the domain only checks and formats them.
 */
export class TaskKey {
  // #region Properties
  /**
   * Property prefix
   *
   * @description
   * The prefix, 2 to 5 uppercase letters A to Z.
   *
   * @type {string}
   * @readonly
   */
  public readonly prefix: string;

  /**
   * Property number
   *
   * @description
   * The number, an integer from 1 to 999,999,999.
   *
   * @type {number}
   * @readonly
   */
  public readonly number: number;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Keeps a checked prefix and number, and freezes the key.
   *
   * @param {string} prefix - The checked prefix.
   * @param {number} number - The checked number.
   * @constructor
   */
  private constructor(prefix: string, number: number) {
    this.prefix = prefix;
    this.number = number;
    Object.freeze(this);
  }
  // #endregion

  // #region Methods
  /**
   * Method of
   *
   * @description
   * Builds a key from its stored parts (`tasks.key_prefix`, `tasks.key_number`) or from a number
   * the spaces module allocated.
   *
   * @param {string} prefix - The prefix.
   * @param {number} number - The number.
   * @returns {TaskKey} The key.
   * @throws {InvalidTaskError} When the prefix is not 2 to 5 uppercase letters, or the number is not
   * an integer from 1 to 999,999,999.
   */
  public static of(prefix: string, number: number): TaskKey {
    if (!prefixPattern.test(prefix)) {
      throw new InvalidTaskError('the prefix of a key has 2 to 5 uppercase letters A to Z');
    }
    if (!Number.isInteger(number) || number < 1 || number > MAX_TASK_NUMBER) {
      throw new InvalidTaskError('the number of a key is an integer from 1 to 999,999,999');
    }
    return new TaskKey(prefix, number);
  }

  /**
   * Method parse
   *
   * @description
   * Reads a key as a path or a body names it. The presentation already refuses, with
   * `400 request.invalid`, a key that does not match the pattern: a lower-case or zero-padded key
   * is not a key.
   *
   * @param {string} text - The key, as `CAD-482`.
   * @returns {TaskKey} The key.
   * @throws {InvalidTaskError} When the text does not match `^[A-Z]{2,5}-[1-9][0-9]{0,8}$`.
   */
  public static parse(text: string): TaskKey {
    const match: RegExpExecArray | null = keyPattern.exec(text);
    const prefix: string | undefined = match?.[1];
    const digits: string | undefined = match?.[2];
    if (prefix === undefined || digits === undefined) {
      throw new InvalidTaskError('a key is a prefix, a dash and a number, as CAD-482');
    }
    return new TaskKey(prefix, Number(digits));
  }

  /**
   * Method isKey
   *
   * @description
   * Whether a text is a key, without throwing.
   *
   * @param {string} text - The text.
   * @returns {boolean} Whether it matches `^[A-Z]{2,5}-[1-9][0-9]{0,8}$`.
   */
  public static isKey(text: string): boolean {
    return keyPattern.test(text);
  }

  /**
   * Method format
   *
   * @description
   * The key as every route and event names it.
   *
   * @returns {string} The prefix, a dash and the number, as `CAD-482`.
   */
  public format(): string {
    return `${this.prefix}-${String(this.number)}`;
  }

  /**
   * Method equals
   *
   * @description
   * Whether two keys name the same task.
   *
   * @param {TaskKey} other - The other key.
   * @returns {boolean} Whether both parts are equal.
   */
  public equals(other: TaskKey): boolean {
    return this.prefix === other.prefix && this.number === other.number;
  }
  // #endregion
}
