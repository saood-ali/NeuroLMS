import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app';
import { User } from '../../models/User';
import { connectMongo } from '../../db/mongo';
import { redisClient } from '../../db/redis';
import * as googleUtils from '../../utils/google';

test('Auth Extra Integration Tests (Google & OTP)', async (t) => {
  if (mongoose.connection.readyState !== 1) {
    await connectMongo();
  }

  await User.deleteMany({ email: 'googleuser@example.com' });
  await User.deleteMany({ email: 'otpuser@example.com' });

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

  await t.test('Setup: Get CSRF Token', async () => {
    const res = await request(app).get('/api/v1/auth/csrf-token');
    assert.strictEqual(res.status, 200);
    csrfToken = res.body.data.csrfToken;
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    csrfCookie = extractCookie(setCookie, '_csrf=');
  });

  await t.test('1. Google Sign-In (New User)', async () => {
    // Mock the google token verification
    const originalVerify = googleUtils.verifyGoogleToken;
    (googleUtils as any).verifyGoogleToken = async () => ({
      email: 'googleuser@example.com',
      name: 'Google User',
      sub: '1234567890',
      picture: 'http://example.com/pic.jpg'
    });

    const res = await request(app)
      .post('/api/v1/auth/google')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie])
      .send({ idToken: 'fake-token' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.user.email, 'googleuser@example.com');
    assert.strictEqual(res.body.data.user.emailVerified, true);
    assert.strictEqual(res.body.data.user.googleId, '1234567890');

    // Restore mock
    (googleUtils as any).verifyGoogleToken = originalVerify;
  });

  await t.test('2. Register OTP User', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie])
      .send({ name: 'OTP User', email: 'otpuser@example.com', password: 'password123', role: 'student' });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.user.emailVerified, false);
    
    userId = res.body.data.user._id;

    const cookies = res.headers['set-cookie'] as unknown as string[];
    accessCookie = extractCookie(cookies, 'accessToken=');
    refreshCookie = extractCookie(cookies, 'refreshToken=');
  });

  await t.test('3. Verify Email with Invalid OTP', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, accessCookie, refreshCookie])
      .send({ otp: '000000' });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.message, 'Invalid OTP');
  });

  await t.test('4. Verify Email with Correct OTP', async () => {
    // Manually extract OTP from redis
    const key = `otp:email-verify:${userId}`;
    const otp = await redisClient.get(key);
    assert.ok(otp, 'OTP should exist in Redis');

    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, accessCookie, refreshCookie])
      .send({ otp });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.emailVerified, true);

    // Verify it's gone from redis
    const otpAfter = await redisClient.get(key);
    assert.strictEqual(otpAfter, null);
  });

  await t.test('5. Resend Verification Email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email/resend')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, accessCookie, refreshCookie]);

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.message, 'Email is already verified');
  });

  await User.deleteMany({ email: 'googleuser@example.com' });
  await User.deleteMany({ email: 'otpuser@example.com' });
  await mongoose.disconnect();
  redisClient.disconnect();
});
