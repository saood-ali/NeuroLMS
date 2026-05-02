import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app';
import { User } from '../../models/User';
import { connectMongo } from '../../db/mongo';
import { redisClient } from '../../db/redis';

test('Password Management & Session Invalidation', async (t) => {
  if (mongoose.connection.readyState !== 1) {
    await connectMongo();
  }

  await User.deleteMany({ email: 'passwordtester@example.com' });

  let csrfToken = '';
  let csrfCookie = '';
  let accessCookie = '';
  let refreshCookie = '';
  let userId = '';

  const extractCookie = (cookies: string[], prefix: string) => {
    if (!cookies) return '';
    const cookieString = cookies.find((c) => c.startsWith(prefix));
    return cookieString ? cookieString.split(';')[0] : '';
  };

  await t.test('Setup: Get CSRF Token and Register User', async () => {
    // 1. Get CSRF Token
    const resCsrf = await request(app).get('/api/v1/auth/csrf-token');
    assert.strictEqual(resCsrf.status, 200);
    csrfToken = resCsrf.body.data.csrfToken;
    csrfCookie = extractCookie(resCsrf.headers['set-cookie'] as unknown as string[], '_csrf=');

    // 2. Register User
    const resReg = await request(app)
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie])
      .send({ name: 'Password Tester', email: 'passwordtester@example.com', password: 'password123', role: 'student' });

    assert.strictEqual(resReg.status, 201);
    userId = resReg.body.data.user._id;

    const cookies = resReg.headers['set-cookie'] as unknown as string[];
    accessCookie = extractCookie(cookies, 'accessToken=');
    refreshCookie = extractCookie(cookies, 'refreshToken=');

    // Make user emailVerified so they can hit change-password endpoint later
    await User.findByIdAndUpdate(userId, { emailVerified: true });
  });

  await t.test('1. Forgot Password (creates OTP)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie])
      .send({ email: 'passwordtester@example.com' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message, 'If the email exists, an OTP has been sent');

    const otp = await redisClient.get(`otp:password-reset:${userId}`);
    assert.ok(otp);
  });

  await t.test('2. Reset Password (with valid OTP)', async () => {
    const otp = await redisClient.get(`otp:password-reset:${userId}`);

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie])
      .send({ email: 'passwordtester@example.com', otp, newPassword: 'newpassword123' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message, 'Password reset successful');

    // The endpoint should have cleared cookies (session invalidated for current client)
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const clearedAccess = setCookie.find(c => c.startsWith('accessToken=;'));
    assert.ok(clearedAccess, 'Access token should be cleared from cookies');
  });

  await t.test('3. Verify Old Session is Invalidated (Refresh fails)', async () => {
    // Attempt to use the old refresh token
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, refreshCookie]);

    assert.strictEqual(res.status, 401);
  });

  await t.test('4. Login with New Password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie])
      .send({ email: 'passwordtester@example.com', password: 'newpassword123' });

    assert.strictEqual(res.status, 200);

    const cookies = res.headers['set-cookie'] as unknown as string[];
    accessCookie = extractCookie(cookies, 'accessToken=');
    refreshCookie = extractCookie(cookies, 'refreshToken=');
  });

  await t.test('5. Change Password (Authenticated)', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/password')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, accessCookie, refreshCookie])
      .send({ currentPassword: 'newpassword123', newPassword: 'evennewerpassword123' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message, 'Password changed');

    // Session should be cleared
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const clearedAccess = setCookie.find(c => c.startsWith('accessToken=;'));
    assert.ok(clearedAccess);
  });

  await t.test('6. Verify Old Session is Invalidated Again', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, refreshCookie]);

    assert.strictEqual(res.status, 401);
  });

  await User.deleteMany({ email: 'passwordtester@example.com' });
  await mongoose.disconnect();
  redisClient.disconnect();
});
