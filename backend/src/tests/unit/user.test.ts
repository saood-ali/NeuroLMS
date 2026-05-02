import test from 'node:test';
import assert from 'node:assert';
import { User } from '../../models/User';

test('User Model - toJSON removes sensitive fields', () => {
  const user = new User({
    name: 'Test',
    email: 'test@example.com',
    passwordHash: 'secret_hash',
    tokenVersion: 1,
    refreshTokenHash: 'refresh_hash',
    pendingEmailChange: {
      newEmail: 'new@example.com',
      otpHash: 'otp_hash',
      otpExpiresAt: new Date()
    }
  });

  const json = user.toJSON();
  
  assert.strictEqual(json.passwordHash, undefined);
  assert.strictEqual(json.tokenVersion, undefined);
  assert.strictEqual(json.refreshTokenHash, undefined);
  assert.strictEqual(json.pendingEmailChange?.otpHash, undefined);
  
  assert.strictEqual(json.name, 'Test');
  assert.strictEqual(json.email, 'test@example.com');
  assert.strictEqual(json.pendingEmailChange?.newEmail, 'new@example.com');
});
