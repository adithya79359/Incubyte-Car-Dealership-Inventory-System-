import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import express from 'express';
import pg from 'pg';
import { createApp } from './app.js';

mkdirSync('data', { recursive: true });
let secret = process.env.JWT_SECRET;
if (!secret) {
  if (process.env.NODE_ENV === 'production') throw new Error('Set JWT_SECRET in production.');
  const keyPath = 'data/.jwt-secret';
  if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(48).toString('hex'), { mode: 0o600 });
  secret = readFileSync(keyPath, 'utf8').trim();
}
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to your PostgreSQL connection string. See .env.example.');
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
db.on('error', error => console.error('Unexpected PostgreSQL connection error:', error.message));
let app;
try { ({ app } = await createApp({ db, secret })); }
catch (error) { await db.end(); throw error; }
if (existsSync('dist/index.html')) {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
}
const port = Number(process.env.PORT) || 3001;
const server = app.listen(port, '127.0.0.1', () => console.log(`Server ready at http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(async () => { await db.end(); }));
}
