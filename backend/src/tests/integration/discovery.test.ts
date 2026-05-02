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

test('Discovery Endpoints (T-026)', async (t) => {
  if (mongoose.connection.readyState !== 1) await connectMongo();

  const emails = {
    instructor: 'inst.disco@example.com',
    student: 'student.disco@example.com',
    admin: 'admin.disco@example.com',
  };

  await User.deleteMany({ email: { $in: Object.values(emails) } });
  await Course.deleteMany({ title: { $regex: 'Disco' } });
  await Category.deleteMany({ name: { $in: ['Disco Math', 'Disco Science'] } });

  let csrfCookie = '';
  let studentCookie = '';
  let studentId = '';
  
  let mathCatId = '';
  let sciCatId = '';
  
  let cFeaturedId = '';
  let cTrendingId = '';
  let cSci1Id = '';

  const extractCookie = (cookies: string[], prefix: string) => {
    if (!cookies) return '';
    const c = cookies.find((c) => c.startsWith(prefix));
    return c ? c.split(';')[0] : '';
  };

  await t.test('Setup: Users, Categories, Courses, Enrollments, Views', async () => {
    const resCsrf = await request(app).get('/api/v1/auth/csrf-token');
    const csrfToken = resCsrf.body.data.csrfToken;
    csrfCookie = extractCookie(resCsrf.headers['set-cookie'] as unknown as string[], '_csrf=');

    const inst = await User.create({ name: 'Inst Disco', email: emails.instructor, passwordHash: 'pwd', role: 'instructor', emailVerified: true });
    const student = await User.create({ name: 'Student Disco', email: emails.student, passwordHash: 'pwd', role: 'student', emailVerified: true });
    studentId = (student as any)._id.toString();

    const resStudent = await request(app).post('/api/v1/auth/login').set('x-csrf-token', csrfToken).set('Cookie', [csrfCookie]).send({ email: emails.student, password: 'pwd' });
    studentCookie = extractCookie(resStudent.headers['set-cookie'] as unknown as string[], 'accessToken=');

    const math = await Category.create({ name: 'Disco Math' });
    const sci = await Category.create({ name: 'Disco Science' });
    mathCatId = (math as any)._id.toString();
    sciCatId = (sci as any)._id.toString();

    // Featured course
    const cF = await Course.create({ title: 'Disco Featured Math', description: 'Desc', instructorId: inst._id, categoryId: mathCatId, level: 'beginner', pricing: 'free', state: 'published', isFeatured: true });
    cFeaturedId = (cF as any)._id.toString();

    // Trending course (has enrollments)
    const cT = await Course.create({ title: 'Disco Trending Math', description: 'Desc', instructorId: inst._id, categoryId: mathCatId, level: 'beginner', pricing: 'free', state: 'published', enrollmentCount: 50 });
    cTrendingId = (cT as any)._id.toString();

    // Science courses
    const cS1 = await Course.create({ title: 'Disco Science 1', description: 'Desc', instructorId: inst._id, categoryId: sciCatId, level: 'beginner', pricing: 'free', state: 'published' });
    cSci1Id = (cS1 as any)._id.toString();
    
    await Course.create({ title: 'Disco Science 2', description: 'Desc', instructorId: inst._id, categoryId: sciCatId, level: 'beginner', pricing: 'free', state: 'published' });

    // Add recent enrollment for Trending Math
    const db = mongoose.connection.db!;
    await db.collection('enrollments').insertOne({ courseId: cT._id, userId: student._id, createdAt: new Date() });

    // Add view history for Science
    await CourseViewHistory.create({ userId: student._id, courseId: cS1._id, categoryId: sciCatId });
  });

  await t.test('1. GET /featured - returns only featured courses', async () => {
    const res = await request(app).get('/api/v1/courses/featured');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.items.length > 0);
    assert.strictEqual(res.body.data.items.every((c: any) => c.isFeatured === true), true);
    assert.ok(res.body.data.items.some((c: any) => c.id === cFeaturedId));
  });

  await t.test('2. GET /trending - prioritizes recent enrollments', async () => {
    const res = await request(app).get('/api/v1/courses/trending');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.items.length > 0);
    assert.strictEqual(res.body.data.items[0].id, cTrendingId);
  });

  await t.test('3. GET /recommendations - relies on view history categories', async () => {
    const res = await request(app)
      .get('/api/v1/courses/recommendations')
      .set('Cookie', [csrfCookie, studentCookie]);

    assert.strictEqual(res.status, 200);
    
    // Student enrolled in Trending Math (math category) and viewed Sci1 (sci category)
    // Recommendations should suggest sci courses and math courses, excluding enrolled
    const recommendedIds = res.body.data.items.map((c: any) => c.id);
    
    assert.ok(recommendedIds.includes(cSci1Id));
    assert.ok(!recommendedIds.includes(cTrendingId)); // Excluded because enrolled
  });

  await t.test('4. GET /recommendations - unauthenticated returns 401', async () => {
    const res = await request(app).get('/api/v1/courses/recommendations');
    assert.strictEqual(res.status, 401);
  });

  // Cleanup
  await User.deleteMany({ email: { $in: Object.values(emails) } });
  await Course.deleteMany({ title: { $regex: 'Disco' } });
  await Category.deleteMany({ name: { $in: ['Disco Math', 'Disco Science'] } });
  await CourseViewHistory.deleteMany({ userId: new mongoose.Types.ObjectId(studentId) });
  const db = mongoose.connection.db!;
  await db.collection('enrollments').deleteMany({ userId: new mongoose.Types.ObjectId(studentId) });

  await mongoose.disconnect();
  redisClient.disconnect();
});
