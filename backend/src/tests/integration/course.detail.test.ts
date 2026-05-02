import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app';
import { User } from '../../models/User';
import { Category } from '../../models/Category';
import { Course } from '../../models/Course';
import { CourseViewHistory } from '../../models/CourseViewHistory';
import { connectMongo } from '../../db/mongo';
import { redisClient } from '../../db/redis';

test('Course Detail & Enrollments (T-027)', async (t) => {
  if (mongoose.connection.readyState !== 1) await connectMongo();

  const emails = {
    inst1: 'i1.detail@example.com',
    inst2: 'i2.detail@example.com',
    student: 's.detail@example.com',
    admin: 'a.detail@example.com',
  };

  await User.deleteMany({ email: { $in: Object.values(emails) } });
  await Course.deleteMany({ title: { $regex: 'Detail' } });
  await Category.deleteMany({ name: 'Detail Category' });

  let studentCookie = '';
  let inst1Cookie = '';
  let inst2Cookie = '';
  let adminCookie = '';

  let pubCourseId = '';
  let draftCourseId = '';

  const extractCookie = (cookies: string[], prefix: string) => {
    if (!cookies) return '';
    const c = cookies.find((c) => c.startsWith(prefix));
    return c ? c.split(';')[0] : '';
  };

  await t.test('Setup: Users, Category, Courses, and Enrollments', async () => {
    const resCsrf = await request(app).get('/api/v1/auth/csrf-token');
    const csrfToken = resCsrf.body.data.csrfToken;
    const csrfCookie = extractCookie(resCsrf.headers['set-cookie'] as unknown as string[], '_csrf=');

    const authPayload = { 'x-csrf-token': csrfToken, 'Cookie': [csrfCookie] };

    const i1 = await User.create({ name: 'Inst 1', email: emails.inst1, passwordHash: 'pwd', role: 'instructor', emailVerified: true });
    const i2 = await User.create({ name: 'Inst 2', email: emails.inst2, passwordHash: 'pwd', role: 'instructor', emailVerified: true });
    const stu = await User.create({ name: 'Student', email: emails.student, passwordHash: 'pwd', role: 'student', emailVerified: true });
    const adm = await User.create({ name: 'Admin', email: emails.admin, passwordHash: 'pwd', role: 'admin', emailVerified: true });

    let res = await request(app).post('/api/v1/auth/login').set(authPayload).send({ email: emails.inst1, password: 'pwd' });
    inst1Cookie = extractCookie(res.headers['set-cookie'] as unknown as string[], 'accessToken=');

    res = await request(app).post('/api/v1/auth/login').set(authPayload).send({ email: emails.inst2, password: 'pwd' });
    inst2Cookie = extractCookie(res.headers['set-cookie'] as unknown as string[], 'accessToken=');

    res = await request(app).post('/api/v1/auth/login').set(authPayload).send({ email: emails.student, password: 'pwd' });
    studentCookie = extractCookie(res.headers['set-cookie'] as unknown as string[], 'accessToken=');

    res = await request(app).post('/api/v1/auth/login').set(authPayload).send({ email: emails.admin, password: 'pwd' });
    adminCookie = extractCookie(res.headers['set-cookie'] as unknown as string[], 'accessToken=');

    const cat = await Category.create({ name: 'Detail Category' });

    const cPub = await Course.create({ title: 'Detail Pub', description: 'desc', instructorId: i1._id, categoryId: cat._id, level: 'beginner', pricing: 'free', state: 'published' });
    pubCourseId = (cPub as any)._id.toString();

    const cDraft = await Course.create({ title: 'Detail Draft', description: 'desc', instructorId: i1._id, categoryId: cat._id, level: 'beginner', pricing: 'free', state: 'draft' });
    draftCourseId = (cDraft as any)._id.toString();

    // Add 2 enrollments for Pub Course
    const db = mongoose.connection.db!;
    await db.collection('enrollments').insertMany([
      { courseId: cPub._id, userId: stu._id, createdAt: new Date(), path: 'free' },
      { courseId: cPub._id, userId: i2._id, createdAt: new Date(), path: 'free' }
    ]);
  });

  await t.test('1. GET /:id (published) - Public access works', async () => {
    const res = await request(app).get(`/api/v1/courses/${pubCourseId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.title, 'Detail Pub');
    assert.strictEqual(res.body.data.isEnrolled, false); // Guest
  });

  await t.test('2. GET /:id (draft) - Public access fails', async () => {
    const res = await request(app).get(`/api/v1/courses/${draftCourseId}`);
    assert.strictEqual(res.status, 404);
  });

  await t.test('3. GET /:id (draft) - Owner access succeeds', async () => {
    const res = await request(app).get(`/api/v1/courses/${draftCourseId}`).set('Cookie', [inst1Cookie]);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.title, 'Detail Draft');
  });

  await t.test('4. GET /:id (draft) - Other instructor access fails', async () => {
    const res = await request(app).get(`/api/v1/courses/${draftCourseId}`).set('Cookie', [inst2Cookie]);
    assert.strictEqual(res.status, 404);
  });

  await t.test('5. GET /:id (draft) - Admin access succeeds', async () => {
    const res = await request(app).get(`/api/v1/courses/${draftCourseId}`).set('Cookie', [adminCookie]);
    assert.strictEqual(res.status, 200);
  });

  await t.test('6. GET /:id (published) - Student access shows enrolled and logs view', async () => {
    const res = await request(app).get(`/api/v1/courses/${pubCourseId}`).set('Cookie', [studentCookie]);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.isEnrolled, true);

    // Wait a brief moment for the fire-and-forget view log to write
    await new Promise(r => setTimeout(r, 100));
    
    const views = await CourseViewHistory.find({ courseId: pubCourseId }).lean();
    assert.ok(views.length > 0, 'View history should be logged');
  });

  await t.test('7. GET /:id/enrollments - Student access fails', async () => {
    const res = await request(app).get(`/api/v1/courses/${pubCourseId}/enrollments`).set('Cookie', [studentCookie]);
    assert.strictEqual(res.status, 404);
  });

  await t.test('8. GET /:id/enrollments - Owner access succeeds', async () => {
    const res = await request(app).get(`/api/v1/courses/${pubCourseId}/enrollments`).set('Cookie', [inst1Cookie]);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.items.length, 2);
    assert.ok(res.body.data.items[0].student.name);
  });

  await t.test('9. GET /:id/enrollments - Admin access succeeds', async () => {
    const res = await request(app).get(`/api/v1/courses/${pubCourseId}/enrollments`).set('Cookie', [adminCookie]);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.items.length, 2);
  });

  // Cleanup
  await User.deleteMany({ email: { $in: Object.values(emails) } });
  await Course.deleteMany({ title: { $regex: 'Detail' } });
  await Category.deleteMany({ name: 'Detail Category' });
  const db = mongoose.connection.db!;
  await db.collection('courseviewhistories').deleteMany({});
  await db.collection('enrollments').deleteMany({});

  await mongoose.disconnect();
  redisClient.disconnect();
});
