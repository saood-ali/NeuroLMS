import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app';
import { User } from '../../models/User';
import { connectMongo } from '../../db/mongo';
import { redisClient } from '../../db/redis';

test('Profile Endpoints — T-020', async (t) => {
  if (mongoose.connection.readyState !== 1) await connectMongo();

  await User.deleteMany({ email: { $in: ['profile.student@example.com', 'profile.instructor@example.com', 'profile.banned@example.com'] } });

  let csrfToken = '';
  let csrfCookie = '';
  let studentAccessCookie = '';
  let instructorId = '';

  const extractCookie = (cookies: string[], prefix: string) => {
    if (!cookies) return '';
    const c = cookies.find(c => c.startsWith(prefix));
    return c ? c.split(';')[0] : '';
  };

  await t.test('Setup: CSRF + Register student + Create instructor/banned users', async () => {
    const resCsrf = await request(app).get('/api/v1/auth/csrf-token');
    csrfToken = resCsrf.body.data.csrfToken;
    csrfCookie = extractCookie(resCsrf.headers['set-cookie'] as unknown as string[], '_csrf=');

    // Register student
    const resReg = await request(app)
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie])
      .send({ name: 'Profile Student', email: 'profile.student@example.com', password: 'password123', role: 'student' });

    assert.strictEqual(resReg.status, 201);
    const cookies = resReg.headers['set-cookie'] as unknown as string[];
    studentAccessCookie = extractCookie(cookies, 'accessToken=');

    // Create instructor directly
    const instructor = await User.create({
      name: 'Profile Instructor',
      email: 'profile.instructor@example.com',
      passwordHash: 'password123',
      role: 'instructor',
      emailVerified: true,
      profile: { bio: 'I teach TypeScript.' },
    });
    instructorId = (instructor as any)._id.toString();

    // Create banned instructor
    await User.create({
      name: 'Banned Instructor',
      email: 'profile.banned@example.com',
      passwordHash: 'password123',
      role: 'instructor',
      emailVerified: true,
      accountState: 'banned',
    });
  });

  await t.test('1. GET /users/me — returns own profile', async () => {
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Cookie', [csrfCookie, studentAccessCookie]);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.email, 'profile.student@example.com');
    assert.ok(!res.body.data.passwordHash, 'passwordHash must not be returned');
    assert.ok(!res.body.data.tokenVersion, 'tokenVersion must not be returned');
  });

  await t.test('2. PATCH /users/me — updates name', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, studentAccessCookie])
      .send({ name: 'Updated Student Name' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.name, 'Updated Student Name');
  });

  await t.test('3. PATCH /users/me — rejects empty name', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, studentAccessCookie])
      .send({ name: '   ' });

    assert.strictEqual(res.status, 400);
  });

  await t.test('4. GET /instructors/:id — returns public instructor profile', async () => {
    const res = await request(app)
      .get(`/api/v1/instructors/${instructorId}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.name, 'Profile Instructor');
    assert.strictEqual(res.body.data.profile.bio, 'I teach TypeScript.');
    assert.ok(!res.body.data.email, 'email must not be returned on public profile');
  });

  await t.test('5. GET /instructors/:id — 404 for student user', async () => {
    const student = await User.findOne({ email: 'profile.student@example.com' });
    const res = await request(app).get(`/api/v1/instructors/${student!._id}`);
    assert.strictEqual(res.status, 404);
  });

  await t.test('6. GET /instructors/:id — 404 for banned instructor', async () => {
    const banned = await User.findOne({ email: 'profile.banned@example.com' });
    const res = await request(app).get(`/api/v1/instructors/${banned!._id}`);
    assert.strictEqual(res.status, 404);
  });

  await t.test('7. GET /instructors/:id — 404 for non-existent id', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/v1/instructors/${fakeId}`);
    assert.strictEqual(res.status, 404);
  });

  await User.deleteMany({ email: { $in: ['profile.student@example.com', 'profile.instructor@example.com', 'profile.banned@example.com'] } });
  await mongoose.disconnect();
  redisClient.disconnect();
});
