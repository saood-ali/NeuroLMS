import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app';
import { User } from '../../models/User';
import { Category } from '../../models/Category';
import { AuditLog } from '../../models/AuditLog';
import { connectMongo } from '../../db/mongo';
import { redisClient } from '../../db/redis';

test('Categories (T-021)', async (t) => {
  if (mongoose.connection.readyState !== 1) await connectMongo();

  await User.deleteMany({ email: { $in: ['admin.cat@example.com', 'student.cat@example.com'] } });
  await Category.deleteMany({ name: { $in: ['Test Category', 'Updated Category', 'Another Category'] } });
  await AuditLog.deleteMany({ targetType: 'category' });

  let csrfToken = '';
  let csrfCookie = '';
  let adminAccessCookie = '';
  let studentAccessCookie = '';
  let adminId = '';

  const extractCookie = (cookies: string[], prefix: string) => {
    if (!cookies) return '';
    const c = cookies.find((c) => c.startsWith(prefix));
    return c ? c.split(';')[0] : '';
  };

  await t.test('Setup: Get CSRF and create Admin & Student', async () => {
    const resCsrf = await request(app).get('/api/v1/auth/csrf-token');
    csrfToken = resCsrf.body.data.csrfToken;
    csrfCookie = extractCookie(resCsrf.headers['set-cookie'] as unknown as string[], '_csrf=');

    // Create admin directly
    const admin = await User.create({
      name: 'Admin Cat',
      email: 'admin.cat@example.com',
      passwordHash: 'password123',
      role: 'admin',
      emailVerified: true,
    });
    adminId = (admin as any)._id.toString();

    // Login admin
    const resAdmin = await request(app)
      .post('/api/v1/auth/login')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie])
      .send({ email: 'admin.cat@example.com', password: 'password123' });
    adminAccessCookie = extractCookie(resAdmin.headers['set-cookie'] as unknown as string[], 'accessToken=');

    // Create student directly
    const student = await User.create({
      name: 'Student Cat',
      email: 'student.cat@example.com',
      passwordHash: 'password123',
      role: 'student',
      emailVerified: true,
    });

    // Login student
    const resStudent = await request(app)
      .post('/api/v1/auth/login')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie])
      .send({ email: 'student.cat@example.com', password: 'password123' });
    studentAccessCookie = extractCookie(resStudent.headers['set-cookie'] as unknown as string[], 'accessToken=');
  });

  let categoryId = '';

  await t.test('1. Create Category - Rejects student (403)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/categories')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, studentAccessCookie])
      .send({ name: 'Test Category' });

    assert.strictEqual(res.status, 404); // 404 is returned to mask admin routes from non-admins
  });

  await t.test('2. Create Category - Success as admin', async () => {
    const res = await request(app)
      .post('/api/v1/admin/categories')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, adminAccessCookie])
      .send({ name: 'Test Category' });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.name, 'Test Category');
    assert.ok(res.body.data.id);
    categoryId = res.body.data.id;

    // Verify Audit Log
    const log = await AuditLog.findOne({ actionType: 'category_create', targetId: categoryId });
    assert.ok(log, 'AuditLog should be created');
    assert.strictEqual(log.adminId.toString(), adminId);
  });

  await t.test('3. Create Category - Rejects duplicate name (409)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/categories')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, adminAccessCookie])
      .send({ name: 'test category' }); // Case-insensitive duplicate

    assert.strictEqual(res.status, 409);
  });

  await t.test('4. Update Category - Success', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/categories/${categoryId}`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, adminAccessCookie])
      .send({ name: 'Updated Category' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.name, 'Updated Category');

    // Verify Audit Log
    const log = await AuditLog.findOne({ actionType: 'category_update', targetId: categoryId });
    assert.ok(log);
    assert.strictEqual(log.metadata?.oldName, 'Test Category');
    assert.strictEqual(log.metadata?.newName, 'Updated Category');
  });

  await t.test('5. List Categories - Publicly accessible', async () => {
    const res = await request(app).get('/api/v1/categories');

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data.items));
    const cat = res.body.data.items.find((c: any) => c.id === categoryId);
    assert.ok(cat);
    assert.strictEqual(cat.name, 'Updated Category');
  });

  await t.test('6. Delete Category - Reject if referenced by a course (409)', async () => {
    // Manually insert a mock course document into the collection to test reference check
    await mongoose.connection.db?.collection('courses').insertOne({
      title: 'Mock Course',
      categoryId: new mongoose.Types.ObjectId(categoryId),
    });

    const res = await request(app)
      .delete(`/api/v1/admin/categories/${categoryId}`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, adminAccessCookie]);

    assert.strictEqual(res.status, 409);

    // Clean up mock course
    await mongoose.connection.db?.collection('courses').deleteOne({ categoryId: new mongoose.Types.ObjectId(categoryId) });
  });

  await t.test('7. Delete Category - Success when no references', async () => {
    const res = await request(app)
      .delete(`/api/v1/admin/categories/${categoryId}`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [csrfCookie, adminAccessCookie]);

    assert.strictEqual(res.status, 200);

    const check = await Category.findById(categoryId);
    assert.strictEqual(check, null);

    // Verify Audit Log
    const log = await AuditLog.findOne({ actionType: 'category_delete', targetId: categoryId });
    assert.ok(log);
  });

  // Cleanup
  await User.deleteMany({ email: { $in: ['admin.cat@example.com', 'student.cat@example.com'] } });
  await Category.deleteMany({ name: { $in: ['Test Category', 'Updated Category', 'Another Category'] } });
  await AuditLog.deleteMany({ targetType: 'category' });

  await mongoose.disconnect();
  redisClient.disconnect();
});
