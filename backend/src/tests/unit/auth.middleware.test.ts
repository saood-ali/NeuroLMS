import test from 'node:test';
import assert from 'node:assert';
import { requireRole, requireEmailVerified, requireOwnership } from '../../middlewares/auth.middleware';
import { ApiError } from '../../utils/ApiError';
import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

test('requireRole - throws 404 if role not matched', () => {
  const req = { user: { role: 'student' } } as unknown as Request;
  const next = () => {};

  assert.throws(() => {
    requireRole('admin')(req, {} as Response, next);
  }, (err: any) => err instanceof ApiError && err.statusCode === 404);
});

test('requireRole - calls next if role matched', () => {
  const req = { user: { role: 'admin' } } as unknown as Request;
  let called = false;
  const next = () => { called = true; };

  requireRole('admin')(req, {} as Response, next);
  assert.strictEqual(called, true);
});

test('requireEmailVerified - throws 400 if not verified', () => {
  const req = { user: { emailVerified: false } } as unknown as Request;
  const next = () => {};

  assert.throws(() => {
    requireEmailVerified(req, {} as Response, next);
  }, (err: any) => err instanceof ApiError && err.statusCode === 400);
});

test('requireOwnership - throws 404 if not owner and not admin', () => {
  const req = { user: { _id: new mongoose.Types.ObjectId(), role: 'student' } } as unknown as Request;
  
  assert.throws(() => {
    requireOwnership(req, new mongoose.Types.ObjectId());
  }, (err: any) => err instanceof ApiError && err.statusCode === 404);
});

test('requireOwnership - passes if owner', () => {
  const id = new mongoose.Types.ObjectId();
  const req = { user: { _id: id, role: 'student' } } as unknown as Request;
  
  // Should not throw
  requireOwnership(req, id);
});

test('requireOwnership - passes if admin, regardless of ownership', () => {
  const req = { user: { _id: new mongoose.Types.ObjectId(), role: 'admin' } } as unknown as Request;
  
  // Should not throw
  requireOwnership(req, new mongoose.Types.ObjectId());
});
