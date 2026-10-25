import express from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createVehicleRouter, initializeVehicles } from './vehicles.js';
const scrypt = promisify(scryptCallback);

export async function createApp({ db, secret }) {
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');
  await db.query(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user'
    )`);
  const app = express();
  await initializeVehicles(db);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb' }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  // Bound repeated password hashing work per client without retaining old entries.
  const attempts = new Map();
  app.use(['/api/auth/login', '/api/auth/register'], (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.reset < now) attempts.delete(key);
    const entry = attempts.get(req.ip) || { count: 0, reset: now + 15 * 60_000 };
    attempts.set(req.ip, entry);
    if (++entry.count > 30) return res.status(429).json({ message: 'Too many attempts. Please try again in 15 minutes.' });
    next();
  });
  const publicUser = ({ id, name, email, role }) => ({ id, name, email, role });
  const session = user => ({
    user: publicUser(user),
    token: jwt.sign({}, secret, { algorithm: 'HS256', subject: String(user.id), issuer: 'dealership', audience: 'dealership-web', expiresIn: '1h' }),
  });
  function credentials(body) {
    if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') return null;
    const email = body.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || body.password.length > 128) return null;
    return { email, password: body.password };
  }

  app.post('/api/auth/register', async (req, res) => {
    const input = credentials(req.body);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!input || input.password.length < 12 || !name || name.length > 80) {
      return res.status(400).json({ message: 'Enter a name (1–80 characters), a valid email, and a password of 12–128 characters.' });
    }
    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(input.password, salt, 64)).toString('hex');
    try {
      const { rows: [user] } = await db.query('INSERT INTO users (name, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role', [name, input.email, hash, salt]);
      return res.status(201).json(session(user));
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ message: 'An account with this email already exists. Please sign in.' });
      throw error;
    }
  });
  app.post('/api/auth/login', async (req, res) => {
    const input = credentials(req.body);
    if (!input || !input.password) return res.status(400).json({ message: 'Enter a valid email and password.' });
    const { rows: [user] } = await db.query('SELECT * FROM users WHERE email = $1', [input.email]);
    const hash = await scrypt(input.password, user?.salt || 'missing-account-salt', 64);
    const expected = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64);
    if (!timingSafeEqual(hash, expected) || !user) return res.status(401).json({ message: 'Invalid email or password.' });
    return res.json(session(user));
  });
  async function authenticate(req, res, next) {
    let claims;
    try {
      const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
      if (!match) throw new Error('Missing token');
      claims = jwt.verify(match[1], secret, { algorithms: ['HS256'], issuer: 'dealership', audience: 'dealership-web' });
      if (!/^\d+$/.test(claims.sub) || Number(claims.sub) > 2147483647) throw new Error('Invalid subject');
    } catch {
      return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
    }
    const { rows: [user] } = await db.query('SELECT id, name, email, role FROM users WHERE id = $1', [claims.sub]);
    if (!user) return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
    req.user = publicUser(user);
    next();
  }
  app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));
  app.use('/api/vehicles', authenticate, createVehicleRouter(db));
  app.use('/api', (_req, res) => res.status(404).json({ message: 'Endpoint not found.' }));
  app.use((error, _req, res, _next) => {
    const status = error.status === 400 || error.status === 413 ? error.status : 500;
    res.status(status).json({ message: status === 500 ? 'Something went wrong. Please try again.' : 'Invalid request body.' });
  });
  return { app, db };
}
