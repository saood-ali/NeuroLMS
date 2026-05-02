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

test('Course Core Endpoints (T-022)', async (t) => {
  if (mongoose.connection.readyState !== 1) await connectMongo();

  await User.deleteMany({ email: { $in: ['instructor.course@example.com', 'student.course@example.com'] } });
  await Category.deleteMany({ name: 'Course Test Category' });
  await Course.deleteMany({ title: { $in: ['Test Course', 'Updated Course', 'Paid Course'] } });

  let csrfToken = '';
  let csrfCookie = '';
  let instructorCookie = '';
  let studentCookie = '';
  let categoryId = '';
  let courseId = '';

  const extractCookie = (cookies: string[], prefix: string) => {
    if (!cookies) return '';
    const c = cookies.find((c) => c.startsWith(prefix));
    return c ? c.split(';')[0] : '';
  };

  await t.test('Setup: Get CSRF, create Users and Category', async () => {
    const resCsrf = await request(app).get('/api/v1/auth/csrf-token');
    csrfToken = resCsrf.body.data.csrfToken;
    csrfCookie = extractCookie(resCsrf.headers['set-cookie'] as unknown as string[], '_csrf=');

    // Create instructor
    await User.create({
      name: 'Instructor Course',
      email: 'instructor.course@example.com',
      passwordHash: 'password123',
      role: 'instructor',
      emailVerified: true,
    });

    const resInst = await request(app)
      .post('/api/v1/auth/login')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie])
      .send({ email: 'instructor.course@example.com', password: 'password123' });
    instructorCookie = extractCookie(resInst.headers['set-cookie'] as unknown as string[], 'accessToken=');

    // Create student
    await User.create({
      name: 'Student Course',
      email: 'student.course@example.com',
      passwordHash: 'password123',
      role: 'student',
      emailVerified: true,
    });

    const resStudent = await request(app)
      .post('/api/v1/auth/login')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie])
      .send({ email: 'student.course@example.com', password: 'password123' });
    studentCookie = extractCookie(resStudent.headers['set-cookie'] as unknown as string[], 'accessToken=');

    // Create Category
    const category = await Category.create({ name: 'Course Test Category' });
    categoryId = (category as any)._id.toString();
  });

  await t.test('1. Create Course - Rejects student (403/404)', async () => {
    const res = await request(app)
      .post('/api/v1/courses')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, studentCookie])
      .send({
        title: 'Test Course',
        description: 'Testing',
        categoryId,
        level: 'beginner',
        pricing: 'free',
      });

    // 404 because requireRole masks the route
    assert.strictEqual(res.status, 404);
  });

  await t.test('2. Create Course - Success (Instructor)', async () => {
    const res = await request(app)
      .post('/api/v1/courses')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, instructorCookie])
      .send({
        title: 'Test Course',
        description: 'Testing',
        categoryId,
        level: 'beginner',
        pricing: 'free',
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.title, 'Test Course');
    assert.strictEqual(res.body.data.state, 'draft');
    courseId = res.body.data.id;
  });

  await t.test('3. Create Course - Rejects invalid price configuration', async () => {
    const res = await request(app)
      .post('/api/v1/courses')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, instructorCookie])
      .send({
        title: 'Paid Course',
        description: 'Testing',
        categoryId,
        level: 'beginner',
        pricing: 'paid',
        // missing priceAmount
      });

    assert.strictEqual(res.status, 400);
  });

  await t.test('4. Update Course - Success', async () => {
    const res = await request(app)
      .patch(`/api/v1/courses/${courseId}`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, instructorCookie])
      .send({
        title: 'Updated Course',
        pricing: 'paid',
        priceAmount: 9900,
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.title, 'Updated Course');
    assert.strictEqual(res.body.data.pricing, 'paid');
    assert.strictEqual(res.body.data.priceAmount, 9900);
  });

  await t.test('5. Update Course - FR-205 Lock Pricing with active enrollments', async () => {
    // Manually force active enrollments
    await Course.findByIdAndUpdate(courseId, { enrollmentCount: 5 });

    const res = await request(app)
      .patch(`/api/v1/courses/${courseId}`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, instructorCookie])
      .send({
        pricing: 'free', // Trying to change paid -> free
      });

    assert.strictEqual(res.status, 400);
    assert.ok(res.body.message.includes('Cannot change pricing designation'));

    // Reset for cleanup
    await Course.findByIdAndUpdate(courseId, { enrollmentCount: 0 });
  });

  await t.test('6. Publish Course - Rejects if 0 lectures', async () => {
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/publish`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, instructorCookie]);
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.message.includes('1 lecture'));
  });

  await t.test('7. Publish Course - Rejects paid course without payout details', async () => {
    // Add a fake lecture count to pass the first check
    await Course.findByIdAndUpdate(courseId, { lectureCount: 1 });

    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/publish`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, instructorCookie]);
    
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.message.includes('payout details'));
  });

  await t.test('8. Publish Course - Success (Free course)', async () => {
    // Change to free to bypass payout check
    await Course.findByIdAndUpdate(courseId, { pricing: 'free', priceAmount: undefined });

    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/publish`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, instructorCookie]);
    
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.state, 'published');
  });

  await t.test('9. Delete Course - Rejects published course', async () => {
    const res = await request(app)
      .delete(`/api/v1/courses/${courseId}`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, instructorCookie]);
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.message.includes('Unpublish it first'));
  });

  await t.test('10. Unpublish Course - Success', async () => {
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/unpublish`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, instructorCookie]);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.state, 'draft');
  });

  await t.test('11. Delete Course - Success and checks cascade', async () => {
    // Insert a dummy record in courseViewHistory to check cascade
    const db = mongoose.connection.db!;
    await db.collection('courseViewHistory').insertOne({ courseId: new mongoose.Types.ObjectId(courseId), userId: 'dummy' });

    const res = await request(app)
      .delete(`/api/v1/courses/${courseId}`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, instructorCookie]);
    
    assert.strictEqual(res.status, 200);

    // Verify course deleted
    const deletedCourse = await Course.findById(courseId);
    assert.strictEqual(deletedCourse, null);

    // Verify cascade deleted
    const historyDoc = await db.collection('courseViewHistory').findOne({ courseId: new mongoose.Types.ObjectId(courseId) });
    assert.strictEqual(historyDoc, null);
  });

  // Cleanup
  await User.deleteMany({ email: { $in: ['instructor.course@example.com', 'student.course@example.com'] } });
  await Category.deleteMany({ name: 'Course Test Category' });
  await Course.deleteMany({ title: { $in: ['Test Course', 'Updated Course', 'Paid Course'] } });

  await mongoose.disconnect();
  redisClient.disconnect();
});
