import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app';
import { User } from '../../models/User';
import { connectMongo } from '../../db/mongo';
import { redisClient } from '../../db/redis';

test('Email Change Flow — T-019', async (t) => {
  if (mongoose.connection.readyState !== 1) await connectMongo();

  await User.deleteMany({ email: { $in: ['emailchange@example.com', 'emailchange-new@example.com', 'emailchange-taken@example.com'] } });

  let csrfToken = '';
  let csrfCookie = '';
  let accessCookie = '';
  let userId = '';

  const extractCookie = (cookies: string[], prefix: string) => {
    if (!cookies) return '';
    const c = cookies.find(c => c.startsWith(prefix));
    return c ? c.split(';')[0] : '';
  };

  await t.test('Setup: Get CSRF + Register + Verify Email', async () => {
    const resCsrf = await request(app).get('/api/v1/auth/csrf-token');
    csrfToken = resCsrf.body.data.csrfToken;
    csrfCookie = extractCookie(resCsrf.headers['set-cookie'] as unknown as string[], '_csrf=');

    const resReg = await request(app)
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie])
      .send({ name: 'Email Changer', email: 'emailchange@example.com', password: 'password123', role: 'student' });

    assert.strictEqual(resReg.status, 201);
    userId = resReg.body.data.user._id;

    const cookies = resReg.headers['set-cookie'] as unknown as string[];
    accessCookie = extractCookie(cookies, 'accessToken=');

    // Mark email verified so we can hit email-change endpoint
    await User.findByIdAndUpdate(userId, { emailVerified: true });

    // Also create a "taken" user to test conflict
    await User.create({
      name: 'Taken',
      email: 'emailchange-taken@example.com',
      passwordHash: 'password123',
      role: 'student',
      emailVerified: true,
    });
  });

  await t.test('1. Initiate Email Change — rejects taken email (409)', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/email-change')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, accessCookie])
      .send({ newEmail: 'emailchange-taken@example.com' });

    assert.strictEqual(res.status, 409);
  });

  await t.test('2. Initiate Email Change — success with valid new email', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/email-change')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, accessCookie])
      .send({ newEmail: 'emailchange-new@example.com' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message, 'OTP sent to new email');

    const user = await User.findById(userId);
    assert.ok(user?.pendingEmailChange?.otpHash, 'OTP hash should be stored');
    assert.strictEqual(user?.pendingEmailChange?.newEmail, 'emailchange-new@example.com');
  });

  await t.test('3. Confirm Email Change — rejects invalid OTP (400)', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/email-change/confirm')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, accessCookie])
      .send({ otp: '000000' });

    assert.strictEqual(res.status, 400);
  });

  await t.test('4. Confirm Email Change — success with correct OTP', async () => {
    // Read the pending OTP hash and brute-force find by comparing stored hash
    const user = await User.findById(userId);
    // We can't get the plaintext OTP from the DB (it's hashed), so we simulate
    // a test-only backdoor: set a known OTP hash directly
    const crypto = await import('crypto');
    const knownOtp = '123456';
    const knownHash = crypto.createHash('sha256').update(knownOtp).digest('hex');
    user!.pendingEmailChange!.otpHash = knownHash;
    user!.pendingEmailChange!.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user!.save();

    const res = await request(app)
      .post('/api/v1/users/me/email-change/confirm')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, accessCookie])
      .send({ otp: knownOtp });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message, 'Email updated successfully');

    const updated = await User.findById(userId);
    assert.strictEqual(updated?.email, 'emailchange-new@example.com');
    assert.strictEqual(updated?.emailVerified, true);
    assert.ok(!updated?.pendingEmailChange?.otpHash, 'pendingEmailChange should be cleared');
  });

  await t.test('5. Confirm with expired OTP — returns 410', async () => {
    // Re-initiate with an already-expired OTP
    const crypto = await import('crypto');
    const knownOtp = '654321';
    const knownHash = crypto.createHash('sha256').update(knownOtp).digest('hex');

    const user = await User.findById(userId);
    // Update email back so we can re-initiate
    user!.email = 'emailchange@example.com';
    user!.pendingEmailChange = {
      newEmail: 'emailchange-new@example.com',
      otpHash: knownHash,
      otpExpiresAt: new Date(Date.now() - 1000), // expired
    };
    await user!.save();

    const res = await request(app)
      .post('/api/v1/users/me/email-change/confirm')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, accessCookie])
      .send({ otp: knownOtp });

    assert.strictEqual(res.status, 410);
  });

  await User.deleteMany({ email: { $in: ['emailchange@example.com', 'emailchange-new@example.com', 'emailchange-taken@example.com'] } });
  await mongoose.disconnect();
  redisClient.disconnect();
});
