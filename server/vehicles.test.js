import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { createApp } from './app.js';

const secret = 'vehicle-test-secret-with-at-least-32-characters';
const car = { make: 'Toyota', model: 'Camry', category: 'Sedan', price: 25000.50, quantity: 2 };
async function setup(t) {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL.');
  const schema = `vehicles_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let db, server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  const { app } = await createApp({ db, secret });
  const { rows } = await db.query("INSERT INTO users (name,email,password_hash,salt,role) VALUES ('Admin','admin@test.com','unused','unused','admin'),('User','user@test.com','unused','unused','user') RETURNING id,role");
  const tokens = Object.fromEntries(rows.map(user => [user.role, jwt.sign({}, secret, { subject: String(user.id), issuer: 'dealership', audience: 'dealership-web', expiresIn: '1h' })]));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const request = async (method, path = '', body, role = 'admin') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/vehicles${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  return { request, db };
}

test('vehicle CRUD persists values and enforces authentication and admin deletion', async t => {
  const { request } = await setup(t);
  assert.equal((await request('GET', '', undefined, 'anonymous')).status, 401);
  const added = await request('POST', '', car, 'user');
  assert.equal(added.status, 201);
  const id = added.body.vehicle.id;
  assert.deepEqual(added.body.vehicle, { id, ...car });
  assert.equal((await request('GET', `/${id}`)).body.vehicle.make, 'Toyota');
  assert.equal((await request('GET')).body.vehicles.length, 1);
  assert.equal((await request('PUT', `/${id}`, { ...car, model: 'Corolla' }, 'user')).body.vehicle.model, 'Corolla');
  assert.equal((await request('DELETE', `/${id}`, undefined, 'user')).status, 403);
  assert.equal((await request('DELETE', `/${id}`)).status, 204);
  assert.equal((await request('GET', `/${id}`)).status, 404);
});

test('vehicle input rejects invalid fields, identifiers, and missing records', async t => {
  const { request } = await setup(t);
  for (const invalid of [{ ...car, make: '' }, { ...car, price: -1 }, { ...car, price: 1.001 }, { ...car, quantity: 1.5 }, { ...car, quantity: -1 }, { ...car, price: '25' }, { ...car, role: 'admin' }]) {
    assert.equal((await request('POST', '', invalid)).status, 400);
  }
  assert.equal((await request('GET', '/bad-id')).status, 400);
  assert.equal((await request('PUT', '/99999', car)).status, 404);
  assert.equal((await request('DELETE', '/99999')).status, 404);
});

test('search combines case-insensitive literal text, category and inclusive price filters', async t => {
  const { request } = await setup(t);
  await request('POST', '', car);
  await request('POST', '', { ...car, make: 'Honda', model: 'CR-V', category: 'SUV', price: 40000, quantity: 0 });
  const found = await request('GET', '/search?make=TOY&model=cam&category=sedan&minPrice=25000.50&maxPrice=25000.50');
  assert.equal(found.status, 200);
  assert.equal(found.body.vehicles.length, 1);
  assert.equal((await request('GET', '/search?make=%25')).body.vehicles.length, 0);
  assert.equal((await request('GET', '/search?category=SUV')).body.vehicles.length, 1);
  for (const query of ['minPrice=bad', 'minPrice=50&maxPrice=10', 'minPrice=-1', 'make=a&make=b', 'unknown=1']) {
    assert.equal((await request('GET', `/search?${query}`)).status, 400);
  }
});

test('purchase and restock validate quantities and protect admin operations', async t => {
  const { request } = await setup(t);
  const id = (await request('POST', '', car)).body.vehicle.id;
  assert.equal((await request('POST', `/${id}/purchase`, {}, 'user')).body.vehicle.quantity, 1);
  assert.equal((await request('POST', `/${id}/purchase`, { quantity: 2 }, 'user')).status, 409);
  assert.equal((await request('POST', `/${id}/restock`, { quantity: 2 }, 'user')).status, 403);
  assert.equal((await request('POST', `/${id}/restock`, { quantity: 3 })).body.vehicle.quantity, 4);
  for (const quantity of [0, -1, 1.5, '2', 2147483648]) {
    assert.equal((await request('POST', `/${id}/purchase`, { quantity })).status, 400);
    assert.equal((await request('POST', `/${id}/restock`, { quantity })).status, 400);
  }
  assert.equal((await request('POST', '/99999/purchase', {})).status, 404);
  assert.equal((await request('POST', `/${id}/restock`, { quantity: 2147483647 })).status, 409);
});

test('concurrent purchases never oversell and concurrent restocks do not lose updates', async t => {
  const { request } = await setup(t);
  const id = (await request('POST', '', { ...car, quantity: 1 })).body.vehicle.id;
  const purchases = await Promise.all([request('POST', `/${id}/purchase`, {}, 'user'), request('POST', `/${id}/purchase`, {}, 'user')]);
  assert.deepEqual(purchases.map(result => result.status).sort(), [200, 409]);
  await Promise.all([request('POST', `/${id}/restock`, { quantity: 2 }), request('POST', `/${id}/restock`, { quantity: 3 })]);
  assert.equal((await request('GET', `/${id}`)).body.vehicle.quantity, 5);
});

test('admin permissions reflect current database role', async t => {
  const { request, db } = await setup(t);
  const id = (await request('POST', '', car)).body.vehicle.id;
  await db.query("UPDATE users SET role = 'user' WHERE role = 'admin'");
  assert.equal((await request('DELETE', `/${id}`)).status, 403);
  assert.equal((await request('POST', `/${id}/restock`, { quantity: 1 })).status, 403);
});
