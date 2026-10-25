# Motorlane authentication

Registration and login page built with React, Tailwind CSS, Node.js, Express, and PostgreSQL. Requires Node.js 24 or newer and a running PostgreSQL server.

## Run locally

Create the application and test databases in PostgreSQL (using psql or pgAdmin):

```sql
CREATE DATABASE motorlane;
CREATE DATABASE motorlane_test;
```

Copy `.env.example` to `.env` and set `DATABASE_URL` and `TEST_DATABASE_URL` with your PostgreSQL username and password. URL-encode special characters in credentials. The server creates its users table on startup.

```sh
npm install
npm run dev
```

Open the local address printed by Vite (normally http://localhost:5173). The API listens at http://127.0.0.1:3001.

```sh
npm test
npm run build
npm start
```

After building, `npm start` serves the frontend and API together at http://127.0.0.1:3001.

## Authentication

- `POST /api/auth/register`: accepts `name`, `email`, and `password`; returns a user and JWT.
- `POST /api/auth/login`: accepts `email` and `password`; returns a user and JWT.
- `GET /api/auth/me`: accepts an `Authorization: Bearer <token>` header; returns the authenticated user.

Passwords require 12–128 characters and are hashed using scrypt with a unique random salt. Email addresses are normalized and unique. New accounts always receive the `user` role. JWTs expire after one hour. The page keeps its token in memory, so refreshing or signing out clears the browser session. Sign-out does not revoke an already issued token on the server.

Accounts persist in PostgreSQL through the connection specified by `DATABASE_URL`. A random development signing secret is generated in `data/.jwt-secret`. This file and `.env` are ignored by Git. For production, set `NODE_ENV=production` and `JWT_SECRET` to a random secret of at least 32 characters, and serve behind HTTPS. Set `PORT` to change the API port (default 3001; update the Vite proxy too when changing it during development).

Tests require `TEST_DATABASE_URL` pointing to a dedicated PostgreSQL test database. Each test creates a uniquely named schema and drops only that schema afterward; the test user must have permission to create schemas. The suite exercises registration, login, duplicate emails, validation, and JWT protection against a real PostgreSQL database.

Existing SQLite files are left untouched; their accounts are not automatically imported into PostgreSQL.

Only authentication is implemented. Vehicle inventory and admin pages are outside this increment.
