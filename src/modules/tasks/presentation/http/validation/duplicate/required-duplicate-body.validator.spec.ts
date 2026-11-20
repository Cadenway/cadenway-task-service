import { ProblemException } from '@cadenway/nest-common';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import { requireDuplicateBody } from './required-duplicate-body.validator.js';

/** A request after the JSON parser has read its body. */
function request(contentType: string | false, length: string | undefined, didRead = true): Request {
  return {
    headers: { 'content-length': length },
    readableDidRead: didRead,
    is: () => contentType,
  } as unknown as Request;
}

describe('the required duplication body', () => {
  it('accepts a declared JSON object and a streamed JSON body', () => {
    expect(() => {
      requireDuplicateBody(request('application/json', '2'));
    }).not.toThrow();
    expect(() => {
      requireDuplicateBody(request('application/json', undefined));
    }).not.toThrow();
  });

  it.each([
    request('application/json', '0'),
    request('application/json', '000'),
    request('application/json', undefined, false),
    request(false, '2'),
  ])('refuses a zero-byte or non-JSON body', (input) => {
    try {
      requireDuplicateBody(input);
      throw new Error('Expected a refusal.');
    } catch (error) {
      expect(error).toBeInstanceOf(ProblemException);
      if (error instanceof ProblemException) {
        expect(error.problem).toMatchObject({
          status: 400,
          code: 'request.invalid',
          details: { issues: [{ in: 'body', code: 'required' }] },
        });
      }
    }
  });
});
