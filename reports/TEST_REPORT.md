# Motorlane test report

Verified on 25 October 2026 with Node.js 24, PostgreSQL, and Microsoft Edge.

| Check | Result |
| --- | --- |
| PostgreSQL API integration tests | 12 passed, 0 failed |
| Browser integration tests | 6 passed, 0 failed |
| Vite production build | Passed |
| Current inventory photo loading | All 7 photos loaded in the browser |

## Backend coverage

Measured with Node's built-in coverage runner. Scope: `server/app.js` and `server/vehicles.js`; this is not frontend coverage or coverage of the server startup file.

| Module | Lines | Branches | Functions |
| --- | --- | --- | --- |
| app.js | 93.81% | 81.63% | 84.62% |
| vehicles.js | 100.00% | 96.40% | 100.00% |
| Combined | 97.32% | 91.88% | 94.12% |

## Covered behavior

- Registration, login, duplicate accounts, JWT verification, invalid and expired tokens.
- Vehicle CRUD, input validation, search combinations and inclusive price bounds.
- Admin deletion/restocking and current database roles.
- Quantity validation, overflow protection, simultaneous purchases, and simultaneous restocks.
- Optional external/local image paths, invalid paths, preserving images, and image removal.
- Customer purchase, sold-out controls, in-stock filter and reset, category tabs, price sorting, details, and grid/list views.
- Admin creation, editing, restocking, deletion and cancellation.
- Theme persistence, broken-image warning/fallback, session expiry, network retry, registration, sign-out, and mobile overflow checks.

## Reproduce

Configure `TEST_DATABASE_URL` in `.env`, then run:

```sh
npm run test:coverage
npm run test:browser
```

Tests use uniquely named schemas in the configured test database. Browser tests build the frontend and run a production-mode test server on port 3101. The browser suite requires Microsoft Edge.

Raw results: [API and coverage output](backend-coverage.txt), [browser and build output](browser-tests.txt).

External image availability can change. Illustration fallbacks remain enabled. No public deployment, load test, or independent security audit is claimed.
