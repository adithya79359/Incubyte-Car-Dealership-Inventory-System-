# Motorlane dealership API

Registration and login page with vehicle CRUD, search, and inventory APIs built with React, Tailwind CSS, Node.js, Express, and PostgreSQL. Requires Node.js 24 or newer and a running PostgreSQL server.

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

## Vehicle APIs (Phases 4–6)

Every endpoint below requires `Authorization: Bearer <token>`. Responses use `{ "vehicle": {...} }` for one vehicle and `{ "vehicles": [...] }` for lists. Prices are JSON numbers backed by exact `NUMERIC(12,2)` storage. Lists include zero-stock vehicles and are ordered by ID.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/vehicles` | Signed in | Create a vehicle |
| GET | `/api/vehicles` | Signed in | List vehicles; accepts the same filters as search |
| GET | `/api/vehicles/:id` | Signed in | Get a vehicle |
| PUT | `/api/vehicles/:id` | Signed in | Replace all five vehicle fields |
| DELETE | `/api/vehicles/:id` | Admin | Delete a vehicle; returns 204 |
| GET | `/api/vehicles/search` | Signed in | Search and filter vehicles |
| POST | `/api/vehicles/:id/purchase` | Signed in | Decrease stock |
| POST | `/api/vehicles/:id/restock` | Admin | Increase stock |

Create and update accept exactly these fields:

```json
{
  "make": "Toyota",
  "model": "Camry",
  "category": "Sedan",
  "price": 25000.50,
  "quantity": 2
}
```

Text fields must contain 1–100 characters after trimming. Price must be between 0 and 9999999999.99 with at most two decimal places. Quantity must be an integer from 0 to 2147483647. PUT requires every field, including quantity; it replaces stock with the submitted value. Use purchase/restock for atomic incremental stock changes.

Search example: `/api/vehicles/search?make=toy&model=cam&category=sedan&minPrice=20000&maxPrice=30000`. Make and model use case-insensitive literal substring matching; category uses case-insensitive exact matching. All supplied filters are combined, and price bounds are inclusive. Invalid, repeated, and unknown filters return 400.

Purchase and restock accept `{ "quantity": 1 }`; omitted quantity defaults to one. Each operation checks stock bounds and changes quantity in a single SQL update, preventing overselling and lost increments under concurrent requests. Invalid input returns 400, unauthenticated requests 401, admin-only violations 403, missing vehicles 404, and insufficient stock or stock overflow 409.

New registrations always receive the `user` role. To grant admin access, a trusted database administrator can run the following after the intended account registers (replace the example email):

```sql
UPDATE users SET role = 'admin' WHERE email = 'owner@example.com';
```

Roles are read from PostgreSQL on every authenticated request, so role changes apply immediately to existing tokens. There is no public endpoint for granting admin access.

## Validation

The 11 integration tests cover authentication, vehicle CRUD and validation, combined search filters, authorization, quantity validation, stock overflow, concurrent purchasing, concurrent restocking, and role changes. Run `npm test` with a configured PostgreSQL test database. The frontend production build is checked with `npm run build`.

The frontend currently contains registration/login only; vehicle and admin pages are not part of these API phases.
