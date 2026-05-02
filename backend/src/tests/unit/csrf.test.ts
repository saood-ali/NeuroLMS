import test from 'node:test';
import assert from 'node:assert';
import { csrfProtection, generateCsrfToken } from '../../middlewares/csrf.middleware';
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../../utils/ApiError';

test('CSRF Middleware - bypasses GET requests', () => {
  const req = { method: 'GET' } as Request;
  const res = {} as Response;
  let nextCalled = false;
  const next = (() => { nextCalled = true; }) as NextFunction;

  csrfProtection(req, res, next);
  assert.strictEqual(nextCalled, true);
});

test('CSRF Middleware - rejects POST without token', () => {
  const req = { method: 'POST', originalUrl: '/api/v1/user', headers: {}, cookies: {} } as Request;
  const res = {} as Response;
  let nextCalledWith: any = null;
  const next = ((err?: any) => { nextCalledWith = err; }) as NextFunction;

  csrfProtection(req, res, next);
  assert.ok(nextCalledWith instanceof ApiError);
  assert.strictEqual(nextCalledWith.statusCode, 403);
  assert.strictEqual(nextCalledWith.message, 'CSRF token missing');
});

test('CSRF Middleware - validates correct token', () => {
  let cookieVal = '';
  const res = {
    cookie: (name: string, val: string) => { cookieVal = val; return res; }
  } as unknown as Response;
  
  const reqGen = {} as Request;
  const token = generateCsrfToken(reqGen, res);

  const req = { 
    method: 'POST', 
    originalUrl: '/api/v1/user', 
    headers: { 'x-csrf-token': token }, 
    cookies: { '_csrf': cookieVal } 
  } as unknown as Request;
  
  let nextError: any = null;
  let nextCalled = false;
  const next = ((err?: any) => { 
    nextError = err; 
    nextCalled = true;
  }) as NextFunction;

  csrfProtection(req, res, next);
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(nextError, undefined);
});
