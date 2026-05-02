import test from 'node:test';
import assert from 'node:assert';


import { generateAccessToken, verifyAccessToken, TokenPayload } from '../../utils/jwt';

test('JWT Utilities - generates and verifies valid token', () => {
  const payload: TokenPayload = {
    userId: '123456',
    role: 'student',
    tokenVersion: 1
  };

  const token = generateAccessToken(payload);
  assert.ok(token.length > 0);

  const decoded = verifyAccessToken(token);
  assert.strictEqual(decoded.userId, payload.userId);
  assert.strictEqual(decoded.role, payload.role);
  assert.strictEqual(decoded.tokenVersion, payload.tokenVersion);
});
