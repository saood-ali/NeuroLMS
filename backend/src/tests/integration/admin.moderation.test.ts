import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app';
import { User } from '../../models/User';
import { Category } from '../../models/Category';
import { Course } from '../../models/Course';
import { AuditLog } from '../../models/AuditLog';
import { connectMongo } from '../../db/mongo';
import { redisClient } from '../../db/redis';

test('Admin Course Moderation (T-024)', async (t) => {
  if (mongoose.connection.readyState !== 1) await connectMongo();

  const emails = {
    admin: 'admin.mod@example.com',
    instructor: 'instructor.mod@example.com',
    student: 'student.mod@example.com',
  };

  await User.deleteMany({ email: { $in: Object.values(emails) } });
  await Category.deleteMany({ name: 'Moderation Category' });
  await Course.deleteMany({ title: { $in: ['Mod Course', 'Feature Course', 'Delete Course'] } });

  let csrfToken = '';
  let csrfCookie = '';
  let adminCookie = '';
  let instructorCookie = '';
  let studentCookie = '';
  let categoryId = '';
  let courseId = '';
  let featureCourseId = '';
  let deleteCourseId = '';

  const extractCookie = (cookies: string[], prefix: string) => {
    if (!cookies) return '';
    const c = cookies.find((c) => c.startsWith(prefix));
    return c ? c.split(';')[0] : '';
  };

  await t.test('Setup: CSRF, users, category, and courses', async () => {
    const resCsrf = await request(app).get('/api/v1/auth/csrf-token');
    csrfToken = resCsrf.body.data.csrfToken;
    csrfCookie = extractCookie(resCsrf.headers['set-cookie'] as unknown as string[], '_csrf=');

    // Create admin
    await User.create({ name: 'Admin Mod', email: emails.admin, passwordHash: 'password123', role: 'admin', emailVerified: true });
    const resAdmin = await request(app).post('/api/v1/auth/login').set('x-csrf-token', csrfToken).set('Cookie', [csrfCookie]).send({ email: emails.admin, password: 'password123' });
    adminCookie = extractCookie(resAdmin.headers['set-cookie'] as unknown as string[], 'accessToken=');

    // Create instructor
    await User.create({ name: 'Instructor Mod', email: emails.instructor, passwordHash: 'password123', role: 'instructor', emailVerified: true });
    const resInst = await request(app).post('/api/v1/auth/login').set('x-csrf-token', csrfToken).set('Cookie', [csrfCookie]).send({ email: emails.instructor, password: 'password123' });
    instructorCookie = extractCookie(resInst.headers['set-cookie'] as unknown as string[], 'accessToken=');

    // Create student
    await User.create({ name: 'Student Mod', email: emails.student, passwordHash: 'password123', role: 'student', emailVerified: true });
    const resStudent = await request(app).post('/api/v1/auth/login').set('x-csrf-token', csrfToken).set('Cookie', [csrfCookie]).send({ email: emails.student, password: 'password123' });
    studentCookie = extractCookie(resStudent.headers['set-cookie'] as unknown as string[], 'accessToken=');

    // Create category
    const category = await Category.create({ name: 'Moderation Category' });
    categoryId = (category as any)._id.toString();

    // Create course for takedown test
    const course = await Course.create({ title: 'Mod Course', description: 'Test', instructorId: (await User.findOne({ email: emails.instructor }))!._id, categoryId, level: 'beginner', pricing: 'free', state: 'published' });
    courseId = (course as any)._id.toString();

    // Create course for feature test
    const fCourse = await Course.create({ title: 'Feature Course', description: 'Test', instructorId: (await User.findOne({ email: emails.instructor }))!._id, categoryId, level: 'beginner', pricing: 'free', state: 'published' });
    featureCourseId = (fCourse as any)._id.toString();

    // Create course for delete test (with enrollments to verify bypass)
    const dCourse = await Course.create({ title: 'Delete Course', description: 'Test', instructorId: (await User.findOne({ email: emails.instructor }))!._id, categoryId, level: 'beginner', pricing: 'free', state: 'published', enrollmentCount: 10 });
    deleteCourseId = (dCourse as any)._id.toString();
  });

  await t.test('1. Takedown Course - Rejects non-admin (404)', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/courses/${courseId}/takedown`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, studentCookie]);
    assert.strictEqual(res.status, 404);
  });

  await t.test('2. Takedown Course - Success as admin', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/courses/${courseId}/takedown`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, adminCookie]);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.state, 'takendown');

    // Verify AuditLog created
    const log = await AuditLog.findOne({ actionType: 'course_takedown', targetId: new mongoose.Types.ObjectId(courseId) });
    assert.ok(log, 'AuditLog should be created for takedown');
  });

  await t.test('3. Feature Course - Rejects non-published course', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/courses/${courseId}/feature`)  // already takendown
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, adminCookie]);
    assert.strictEqual(res.status, 400);
  });

  await t.test('4. Feature Course - Success on published course', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/courses/${featureCourseId}/feature`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, adminCookie]);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.isFeatured, true);

    // Verify AuditLog
    const log = await AuditLog.findOne({ actionType: 'course_feature', targetId: new mongoose.Types.ObjectId(featureCourseId) });
    assert.ok(log, 'AuditLog should be created for feature');
  });

  await t.test('5. Unfeature Course - Success', async () => {
    const res = await request(app)
      .delete(`/api/v1/admin/courses/${featureCourseId}/feature`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, adminCookie]);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.isFeatured, false);

    const log = await AuditLog.findOne({ actionType: 'course_unfeature', targetId: new mongoose.Types.ObjectId(featureCourseId) });
    assert.ok(log, 'AuditLog should be created for unfeature');
  });

  await t.test('6. Admin Delete Course - Bypasses enrollment restriction', async () => {
    // Insert a dummy cascade record
    const db = mongoose.connection.db!;
    await db.collection('enrollments').insertOne({ courseId: new mongoose.Types.ObjectId(deleteCourseId), userId: 'dummy' });

    const res = await request(app)
      .delete(`/api/v1/admin/courses/${deleteCourseId}`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, adminCookie]);
    assert.strictEqual(res.status, 200);

    // Verify deleted
    const deleted = await Course.findById(deleteCourseId);
    assert.strictEqual(deleted, null);

    // Verify cascade
    const enrollment = await db.collection('enrollments').findOne({ courseId: new mongoose.Types.ObjectId(deleteCourseId) });
    assert.strictEqual(enrollment, null);

    // Verify AuditLog
    const log = await AuditLog.findOne({ actionType: 'course_remove', targetId: new mongoose.Types.ObjectId(deleteCourseId) });
    assert.ok(log, 'AuditLog should be created for admin delete');
  });

  // Cleanup
  await User.deleteMany({ email: { $in: Object.values(emails) } });
  await Category.deleteMany({ name: 'Moderation Category' });
  await Course.deleteMany({ title: { $in: ['Mod Course', 'Feature Course', 'Delete Course'] } });
  await AuditLog.deleteMany({ actionType: { $in: ['course_takedown', 'course_feature', 'course_unfeature', 'course_remove'] } });

  await mongoose.disconnect();
  redisClient.disconnect();
});
