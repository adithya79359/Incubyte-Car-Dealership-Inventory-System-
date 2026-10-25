import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { createApp } from './app.js';

const secret = 'a-test-only-secret-that-is-at-least-32-characters';
if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a PostgreSQL test database before running tests.');
async function setup(t) {
  const schema = `auth_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let db;
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  const { app } = await createApp({ db, secret });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  return async (path, body, token) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
}
const account = { name: 'Sam Driver', email: 'sam@example.com', password: 'a-safe-password-123' };

test('registration stores an account and issues a verifiable JWT', async t => {
  const request = await setup(t);
  const result = await request('register', { ...account, role: 'admin' });
  assert.equal(result.status, 201);
  assert.equal(result.body.user.role, 'user');
  assert.equal(result.body.user.password, undefined);
  const claims = jwt.verify(result.body.token, secret, { issuer: 'dealership', audience: 'dealership-web' });
  assert.equal(claims.sub, String(result.body.user.id));
  const me = await request('me', null, result.body.token);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, account.email);
});

test('login normalizes email and rejects incorrect credentials', async t => {
  const request = await setup(t);
  await request('register', account);
  assert.equal((await request('login', { email: ' SAM@EXAMPLE.COM ', password: account.password })).status, 200);
  for (const email of [account.email, 'missing@example.com']) {
    const result = await request('login', { email, password: 'wrong-password' });
    assert.equal(result.status, 401);
    assert.equal(result.body.message, 'Invalid email or password.');
  }
});

test('registration validates input and blocks duplicate normalized emails', async t => {
  const request = await setup(t);
  for (const invalid of [{ ...account, name: '' }, { ...account, email: 'bad' }, { ...account, password: 'short' }, { ...account, password: 123 }]) {
    assert.equal((await request('register', invalid)).status, 400);
  }
  assert.equal((await request('register', account)).status, 201);
  assert.equal((await request('register', { ...account, email: 'SAM@example.com' })).status, 409);
});

test('protected profile rejects absent, forged, and expired tokens', async t => {
  const request = await setup(t);
  const expired = jwt.sign({}, secret, { subject: '1', issuer: 'dealership', audience: 'dealership-web', expiresIn: -1 });
  for (const token of [undefined, 'forged', expired]) {
    assert.equal((await request('me', null, token)).status, 401);
  }
});

test('concurrent registrations preserve the unique email constraint', async t => {
  const request = await setup(t);
  const results = await Promise.all([
    request('register', account),
    request('register', { ...account, email: account.email.toUpperCase() }),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  assert.equal((await request('login', account)).status, 200);
});
