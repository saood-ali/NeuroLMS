import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app';
import { User } from '../../models/User';
import { Category } from '../../models/Category';
import { Course } from '../../models/Course';
import { connectMongo } from '../../db/mongo';
import { redisClient } from '../../db/redis';

test('Catalog Discovery (T-025)', async (t) => {
  if (mongoose.connection.readyState !== 1) await connectMongo();

  const emails = {
    instructor: 'instructor.catalog@example.com',
    student: 'student.catalog@example.com',
  };

  await User.deleteMany({ email: { $in: Object.values(emails) } });
  await Category.deleteMany({ name: { $in: ['Web Dev', 'Data Science'] } });
  await Course.deleteMany({ title: { $regex: 'Catalog' } });

  let csrfToken = '';
  let csrfCookie = '';
  let studentCookie = '';
  let catWebId = '';
  let catDataId = '';
  let courseReactId = '';

  const extractCookie = (cookies: string[], prefix: string) => {
    if (!cookies) return '';
    const c = cookies.find((c) => c.startsWith(prefix));
    return c ? c.split(';')[0] : '';
  };

  await t.test('Setup: Create categories, courses, and student', async () => {
    const resCsrf = await request(app).get('/api/v1/auth/csrf-token');
    csrfToken = resCsrf.body.data.csrfToken;
    csrfCookie = extractCookie(resCsrf.headers['set-cookie'] as unknown as string[], '_csrf=');

    // Create instructor and student
    const inst = await User.create({ name: 'Instructor Cat', email: emails.instructor, passwordHash: 'password123', role: 'instructor', emailVerified: true });
    const student = await User.create({ name: 'Student Cat', email: emails.student, passwordHash: 'password123', role: 'student', emailVerified: true });

    const resStudent = await request(app).post('/api/v1/auth/login').set('x-csrf-token', csrfToken).set('Cookie', [csrfCookie]).send({ email: emails.student, password: 'password123' });
    studentCookie = extractCookie(resStudent.headers['set-cookie'] as unknown as string[], 'accessToken=');

    // Create categories
    const catWeb = await Category.create({ name: 'Web Dev' });
    const catData = await Category.create({ name: 'Data Science' });
    catWebId = (catWeb as any)._id.toString();
    catDataId = (catData as any)._id.toString();

    // Create courses
    const c1 = await Course.create({ title: 'Catalog React Web', description: 'Learn React', instructorId: inst._id, categoryId: catWebId, level: 'intermediate', pricing: 'paid', priceAmount: 49900, state: 'published', averageRating: 4.5 });
    courseReactId = (c1 as any)._id.toString();
    
    await Course.create({ title: 'Catalog Python Data', description: 'Learn Data Science', instructorId: inst._id, categoryId: catDataId, level: 'beginner', pricing: 'free', state: 'published', averageRating: 3.5 });
    await Course.create({ title: 'Catalog Draft', description: 'Hidden', instructorId: inst._id, categoryId: catWebId, level: 'beginner', pricing: 'free', state: 'draft' });
  });

  await t.test('1. Get all published courses (pagination & default sort)', async () => {
    const res = await request(app).get('/api/v1/courses?limit=10');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.items.length, 2); // 2 published courses
    assert.strictEqual(res.body.data.items.some((c: any) => c.title === 'Catalog Draft'), false);
  });

  await t.test('2. Filter by categoryId', async () => {
    const res = await request(app).get(`/api/v1/courses?categoryId=${catDataId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.items.length, 1);
    assert.strictEqual(res.body.data.items[0].title, 'Catalog Python Data');
  });

  await t.test('3. Filter by level and pricing', async () => {
    const res = await request(app).get('/api/v1/courses?level=intermediate&pricing=paid');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.items.length, 1);
    assert.strictEqual(res.body.data.items[0].title, 'Catalog React Web');
  });

  await t.test('4. Text search (q)', async () => {
    const res = await request(app).get('/api/v1/courses?q=React');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.items.length, 1);
    assert.strictEqual(res.body.data.items[0].title, 'Catalog React Web');
  });

  await t.test('5. Sort by averageRating desc', async () => {
    const res = await request(app).get('/api/v1/courses?sortBy=averageRating&sortDir=desc');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.items[0].title, 'Catalog React Web'); // 4.5 vs 3.5
  });

  await t.test('6. Filter by minPrice', async () => {
    const res = await request(app).get('/api/v1/courses?minPrice=40000');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.items.length, 1);
    assert.strictEqual(res.body.data.items[0].priceAmount, 49900);
  });

  await t.test('7. Auth-aware isEnrolled flag', async () => {
    // Manually add enrollment
    const db = mongoose.connection.db!;
    const student = await User.findOne({ email: emails.student });
    await db.collection('enrollments').insertOne({ courseId: new mongoose.Types.ObjectId(courseReactId), userId: student!._id });

    // Unauthenticated request
    const resUnauth = await request(app).get(`/api/v1/courses?q=React`);
    assert.strictEqual(resUnauth.body.data.items[0].isEnrolled, false);

    // Authenticated request
    const resAuth = await request(app)
      .get(`/api/v1/courses?q=React`)
      .set('Cookie', [csrfCookie, studentCookie]);
    assert.strictEqual(resAuth.body.data.items[0].isEnrolled, true);
  });

  // Cleanup
  await User.deleteMany({ email: { $in: Object.values(emails) } });
  await Category.deleteMany({ name: { $in: ['Web Dev', 'Data Science'] } });
  await Course.deleteMany({ title: { $regex: 'Catalog' } });

  await mongoose.disconnect();
  redisClient.disconnect();
});
