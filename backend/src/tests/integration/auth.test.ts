import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app';
import { User } from '../../models/User';
import { connectMongo } from '../../db/mongo';
import { redisClient } from '../../db/redis';

test('Auth Integration Tests', async (t) => {
  if (mongoose.connection.readyState !== 1) {
    await connectMongo();
  }

  await User.deleteMany({ email: 'john@example.com' });

  let csrfToken = '';
  let csrfCookie = '';
  let accessCookie = '';
  let refreshCookie = '';

  const extractCookie = (cookies: string[], prefix: string) => {
    if (!cookies) return '';
    const cookieString = cookies.find((c) => c.startsWith(prefix));
    return cookieString ? cookieString.split(';')[0] : '';
  };

  await t.test('1. Get CSRF Token', async () => {
    const res = await request(app).get('/api/v1/auth/csrf-token');
    assert.strictEqual(res.status, 200);
    csrfToken = res.body.data.csrfToken;
    assert.ok(csrfToken, 'CSRF token must be present');

    // Extract the _csrf cookie to use in subsequent requests
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    csrfCookie = extractCookie(setCookie, '_csrf=');
    assert.ok(csrfCookie, '_csrf cookie must be present');
  });

  await t.test('2. Register a new user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie]) // Double submit pattern
      .send({ name: 'John Doe', email: 'john@example.com', password: 'password123', role: 'student' });

    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.data.user.email, 'john@example.com');
  });

  await t.test('3. Login', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie])
      .send({ email: 'john@example.com', password: 'password123' });

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    accessCookie = extractCookie(cookies, 'accessToken=');
    refreshCookie = extractCookie(cookies, 'refreshToken=');
    assert.ok(accessCookie, 'accessToken cookie must be set after login');
    assert.ok(refreshCookie, 'refreshToken cookie must be set after login');
  });

  await t.test('4. Refresh Session', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [accessCookie, refreshCookie, csrfCookie])
      .set('x-csrf-token', csrfToken);

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.message, 'Session refreshed');

    const cookies = res.headers['set-cookie'] as unknown as string[];
    accessCookie = extractCookie(cookies, 'accessToken=') || accessCookie;
    refreshCookie = extractCookie(cookies, 'refreshToken=') || refreshCookie;
  });

  await t.test('5. Logout', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [accessCookie, refreshCookie, csrfCookie])
      .set('x-csrf-token', csrfToken);

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.message, 'Logged out');
  });

  await t.test('6. Refresh after Logout must fail (invalidated session)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [accessCookie, refreshCookie, csrfCookie])
      .set('x-csrf-token', csrfToken);

    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.message.includes('Invalid or expired refresh token'));
  });

  await User.deleteMany({ email: 'john@example.com' });
  await mongoose.disconnect();
  redisClient.disconnect();
});
