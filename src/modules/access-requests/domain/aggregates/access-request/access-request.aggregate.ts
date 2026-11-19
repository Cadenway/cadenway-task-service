import { AccessRequestDecidedError } from '../../errors/access-request/access-request-decided.error.js';
import { InvalidAccessRequestError } from '../../errors/access-request/invalid-access-request.error.js';
import { isAccessRole } from '../../value-objects/access/access-role.value-object.js';
import type { AccessRole } from '../../value-objects/access/access-role.value-object.js';
import type { AccessRequestDraft } from '../../value-objects/access-request/access-request-draft.value-object.js';
import type { AccessRequestState } from '../../value-objects/access-request/access-request-state.value-object.js';
import { isAccessRequestStatus } from '../../value-objects/access-request/access-request-status.value-object.js';
import { isAccessRequestTarget } from '../../value-objects/access-request/access-request-target.value-object.js';
import type { GrantTarget } from '../../value-objects/access-request/grant-target.value-object.js';
import type { NewAccessRequest } from '../../value-objects/access-request/new-access-request.value-object.js';
import type { RequestActor } from '../../value-objects/access-request/request-actor.value-object.js';

/**
 * Constant MESSAGE_MAX_LENGTH
 *
 * @description
 * The most characters of a message ("Message pour Léa (facultatif)", `maxLength: 500` of
 * `AccessRequestCreation`, decision 11 of P3b-1).
 *
 * @type {number}
 */
const MESSAGE_MAX_LENGTH: number = 500;

/**
 * Constant TASK_KEY_PATTERN
 *
 * @description
 * `TaskKey` of `openapi/internal/task-service.yaml`: the prefix of a space, a dash and a number.
 *
 * @type {RegExp}
 */
const TASK_KEY_PATTERN: RegExp = /^[A-Z]{2,5}-[1-9][0-9]{0,8}$/u;

/**
 * Constant ACTOR_TYPES
 *
 * @description
 * The actor types of `Actor` of the contract a stored decision may carry.
 *
 * @type {readonly string[]}
 */
const ACTOR_TYPES: readonly string[] = Object.freeze(['user', 'automation', 'git', 'system']);

/**
 * Function lengthOf
 *
 * @description
 * Length of a text in Unicode code points, the characters `maxLength` of JSON Schema counts.
 *
 * @param {string} text - The text.
 * @returns {number} Its number of characters.
 */
function lengthOf(text: string): number {
  return Array.from(text).length;
}

/**
 * Function requireId
 *
 * @description
 * Refuses an empty id: a request always names its organization, its requester and its target.
 *
 * @param {string} id - The id.
 * @param {string} what - What the id names, for the message.
 * @returns {string} The same id.
 * @throws {InvalidAccessRequestError} When it is empty.
 */
function requireId(id: string, what: string): string {
  if (id === '') {
    throw new InvalidAccessRequestError(`the id of ${what} is set`);
  }
  return id;
}

/**
 * Function normalizeMessage
 *
 * @description
 * `message` of `AccessRequestCreation`: trimmed, `null` or an empty text for none, 500 characters
 * at most.
 *
 * @param {string | null} message - The message as typed.
 * @returns {string | null} The trimmed message, or `null` when there is none.
 * @throws {InvalidAccessRequestError} When the trimmed message is too long.
 */
function normalizeMessage(message: string | null): string | null {
  if (message === null) {
    return null;
  }
  const trimmed: string = message.trim();
  if (trimmed === '') {
    return null;
  }
  if (lengthOf(trimmed) > MESSAGE_MAX_LENGTH) {
    throw new InvalidAccessRequestError('the message has at most 500 characters once trimmed');
  }
  return trimmed;
}

/**
 * Function targetIdOf
 *
 * @description
 * Checks that a request names its target the way the contract shapes it (`AccessRequest` of
 * `openapi/internal/task-service.yaml`): a space with no list and no task, a list with its list and
 * no task, a task with its list, its id and its key; and gives the id of the target.
 *
 * @param {Pick<AccessRequestDraft, 'target' | 'spaceId' | 'listId' | 'taskId' | 'taskKey'>} request
 * - Where the request points.
 * @returns {string} The id of the space, the list or the task asked for.
 * @throws {InvalidAccessRequestError} When the members do not fit the target.
 */
function targetIdOf(
  request: Pick<AccessRequestDraft, 'target' | 'spaceId' | 'listId' | 'taskId' | 'taskKey'>,
): string {
  requireId(request.spaceId, 'the space');
  switch (request.target) {
    case 'space':
      if (request.listId !== null || request.taskId !== null || request.taskKey !== null) {
        throw new InvalidAccessRequestError('a space request names no list and no task');
      }
      return request.spaceId;
    case 'list':
      if (request.listId === null || request.taskId !== null || request.taskKey !== null) {
        throw new InvalidAccessRequestError('a list request names its list and no task');
      }
      return requireId(request.listId, 'the list');
    case 'task':
      if (
        request.listId === null ||
        request.taskId === null ||
        request.taskKey === null ||
        !TASK_KEY_PATTERN.test(request.taskKey)
      ) {
        throw new InvalidAccessRequestError('a task request names its list, its task and its key');
      }
      requireId(request.listId, 'the list');
      return requireId(request.taskId, 'the task');
  }
}

/**
 * Function checkDecision
 *
 * @description
 * Refuses a stored decision no answer can produce: a role exactly for an approval, an instant and
 * an actor exactly for an answered request.
 *
 * @param {AccessRequestState} state - The stored state.
 * @throws {InvalidAccessRequestError} When the decision breaks an invariant.
 */
function checkDecision(state: AccessRequestState): void {
  if (!isAccessRequestStatus(state.status)) {
    throw new InvalidAccessRequestError('the status is pending, approved or refused');
  }
  if ((state.status === 'approved') !== (state.role !== null)) {
    throw new InvalidAccessRequestError('an approved request, and only it, has a role');
  }
  if (state.role !== null && !isAccessRole(state.role)) {
    throw new InvalidAccessRequestError('the role is edit, comment or view');
  }
  const pending: boolean = state.status === 'pending';
  if (pending !== (state.decidedAt === null) || pending !== (state.decidedBy === null)) {
    throw new InvalidAccessRequestError('an answered request, and only it, has a decision');
  }
  if (
    state.decidedBy !== null &&
    (!ACTOR_TYPES.includes(state.decidedBy.type) || state.decidedBy.id === '')
  ) {
    throw new InvalidAccessRequestError('the decision names a known actor');
  }
}

/**
 * Class AccessRequest
 *
 * @description
 * A request for access to a space, a list or a task ("Demander l’accès", decision 4 of P3b-1,
 * "Access requests" of `openapi/public/access.yaml`). Rules:
 *
 * - it names exactly one target: a space, a list, or a task with the list it was in when asked,
 *   which an approval grants;
 * - its message is trimmed, `null` when empty, 500 characters at most;
 * - it changes once, from `pending` to `approved` with a role or to `refused`; a second answer is
 *   refused with the status it has (`AccessRequestDecidedError`);
 * - its version, which its events carry, is 1 while pending and 2 once answered.
 *
 * Whether it is stored at all (`isRequestStored`), the hourly limit (`checkRequestQuota`) and who
 * may answer it (the people who manage its target) are decided outside this class.
 */
export class AccessRequest {
  // #region Properties
  /**
   * Property state
   *
   * @description
   * The state of the request; an answer returns a new `AccessRequest`.
   *
   * @type {AccessRequestState}
   * @readonly
   */
  private readonly state: AccessRequestState;

  /**
   * Property snapshot
   *
   * @description
   * The state to store.
   *
   * @type {AccessRequestState}
   * @readonly
   */
  public get snapshot(): AccessRequestState {
    return this.state;
  }

  /**
   * Property version
   *
   * @description
   * The version its events carry: 1 while pending, 2 once answered (`AccessRequest` of the
   * contract: "its events carry `1`, then `2`").
   *
   * @type {number}
   * @readonly
   */
  public get version(): number {
    return this.state.status === 'pending' ? 1 : 2;
  }

  /**
   * Property grantTarget
   *
   * @description
   * What an approval grants: the space of a space request, the list of a list or a task request.
   *
   * @type {GrantTarget}
   * @readonly
   */
  public get grantTarget(): GrantTarget {
    const { target, spaceId, listId } = this.state;
    if (target === 'space' || listId === null) {
      return { kind: 'space', spaceId };
    }
    return { kind: 'list', listId };
  }
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Keeps a state checked by `restore` or built by a checked answer.
   *
   * @param {AccessRequestState} state - The checked state.
   * @constructor
   */
  private constructor(state: AccessRequestState) {
    this.state = state;
  }
  // #endregion

  // #region Methods
  /**
   * Method ask
   *
   * @description
   * Checks and normalizes a new request (`AccessRequestCreation` of
   * `openapi/internal/task-service.yaml`): its target shape and its message, trimmed, an empty one
   * as none. Whether it is stored is decided by `isRequestStored` first.
   *
   * @param {NewAccessRequest} input - The request as resolved.
   * @returns {AccessRequestDraft} The request to store, pending.
   * @throws {InvalidAccessRequestError} When a member breaks an invariant, which the message names.
   */
  public static ask(input: NewAccessRequest): AccessRequestDraft {
    if (!isAccessRequestTarget(input.target)) {
      throw new InvalidAccessRequestError('the target is a space, a list or a task');
    }
    return {
      organizationId: requireId(input.organizationId, 'the organization'),
      target: input.target,
      targetId: targetIdOf(input),
      spaceId: input.spaceId,
      listId: input.listId,
      taskId: input.taskId,
      taskKey: input.taskKey,
      requesterUserId: requireId(input.requesterUserId, 'the requester'),
      message: normalizeMessage(input.message),
    };
  }

  /**
   * Method restore
   *
   * @description
   * Rebuilds a stored request, refusing a state no request or answer can produce.
   *
   * @param {AccessRequestState} state - The stored state.
   * @returns {AccessRequest} The request.
   * @throws {InvalidAccessRequestError} When a member breaks an invariant.
   */
  public static restore(state: AccessRequestState): AccessRequest {
    requireId(state.id, 'the request');
    requireId(state.organizationId, 'the organization');
    requireId(state.requesterUserId, 'the requester');
    if (!isAccessRequestTarget(state.target)) {
      throw new InvalidAccessRequestError('the target is a space, a list or a task');
    }
    if (targetIdOf(state) !== state.targetId) {
      throw new InvalidAccessRequestError('the target id is the id of the space, list or task');
    }
    if (normalizeMessage(state.message) !== state.message) {
      throw new InvalidAccessRequestError('the message is trimmed and not empty');
    }
    checkDecision(state);
    return new AccessRequest(state);
  }

  /**
   * Method approve
   *
   * @description
   * Answers a pending request with a role ("Approve an access request" of
   * `openapi/public/access.yaml`): the grant itself is given by the spaces module in the same
   * transaction.
   *
   * @param {AccessRole} role - The role the approval gives.
   * @param {RequestActor} actor - Who approves.
   * @param {Date} at - When, the clock of the transaction.
   * @returns {AccessRequest} The request, approved.
   * @throws {AccessRequestDecidedError} When the request was already answered.
   * @throws {InvalidAccessRequestError} When the role or the actor is not one of the contract.
   */
  public approve(role: AccessRole, actor: RequestActor, at: Date): AccessRequest {
    this.ensurePending();
    if (!isAccessRole(role)) {
      throw new InvalidAccessRequestError('the role is edit, comment or view');
    }
    return this.decide('approved', role, actor, at);
  }

  /**
   * Method refuse
   *
   * @description
   * Answers a pending request with a refusal ("Refuse an access request" of
   * `openapi/public/access.yaml`): nothing else changes.
   *
   * @param {RequestActor} actor - Who refuses.
   * @param {Date} at - When, the clock of the transaction.
   * @returns {AccessRequest} The request, refused.
   * @throws {AccessRequestDecidedError} When the request was already answered.
   * @throws {InvalidAccessRequestError} When the actor is not one of the contract.
   */
  public refuse(actor: RequestActor, at: Date): AccessRequest {
    this.ensurePending();
    return this.decide('refused', null, actor, at);
  }

  /**
   * Method ensurePending
   *
   * @description
   * Refuses a second answer, with the status of the first.
   *
   * @throws {AccessRequestDecidedError} When the request is no longer pending.
   */
  private ensurePending(): void {
    if (this.state.status !== 'pending') {
      throw new AccessRequestDecidedError(this.state.status);
    }
  }

  /**
   * Method decide
   *
   * @description
   * Builds the answered request, checked as a stored one would be.
   *
   * @param {'approved' | 'refused'} status - The answer.
   * @param {AccessRole | null} role - The role of an approval, `null` for a refusal.
   * @param {RequestActor} actor - Who answers.
   * @param {Date} at - When.
   * @returns {AccessRequest} The request, answered.
   * @throws {InvalidAccessRequestError} When the actor is not one of the contract.
   */
  private decide(
    status: 'approved' | 'refused',
    role: AccessRole | null,
    actor: RequestActor,
    at: Date,
  ): AccessRequest {
    const state: AccessRequestState = {
      ...this.state,
      status,
      role,
      decidedAt: at,
      decidedBy: { type: actor.type, id: actor.id },
    };
    checkDecision(state);
    return new AccessRequest(state);
  }
  // #endregion
}
