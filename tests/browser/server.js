import { randomUUID, scryptSync } from 'node:crypto';
import { resolve } from 'node:path';
import express from 'express';
import pg from 'pg';
import { createApp } from '../../server/app.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to run browser integration tests.');
const schema = `browser_test_${randomUUID().replaceAll('-', '')}`;
const control = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
await control.query(`CREATE SCHEMA "${schema}"`);
const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
process.env.NODE_ENV = 'production';
const { app } = await createApp({ db, secret: 'browser-test-only-secret-at-least-32-characters' });
const hash = scryptSync('Browser-test-password-123', 'browser-test-salt', 64).toString('hex');
await db.query("INSERT INTO users(name,email,password_hash,salt,role) VALUES ('Test Admin','admin@example.com',$1,'browser-test-salt','admin'),('Test Buyer','buyer@example.com',$1,'browser-test-salt','user')", [hash]);
await db.query("INSERT INTO vehicles(make,model,category,price,quantity) VALUES ('Toyota','Camry','Sedan',25000.50,1),('Honda','CR-V','SUV',40000,0)");
app.use(express.static(resolve('dist')));
app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
const server = app.listen(3101, '127.0.0.1');
async function cleanup() {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await db.end();
  await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => cleanup().then(() => process.exit(0)));
