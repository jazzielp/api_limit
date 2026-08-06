# api_limit

Express 5 + TypeScript API with JWT authentication, email verification, password reset, API keys, and a per-user 100-request daily rate limit.

## Quick path

1. Install dependencies: `pnpm install`
2. Copy `.env.example` to `.env.development` and `.env.test` and fill in placeholders.
3. Generate the Prisma client: `NODE_ENV=development pnpm prisma:generate`
4. Run migrations against a real Postgres database: `NODE_ENV=development pnpm prisma:migrate`
5. Start the server: `NODE_ENV=development pnpm dev`
6. Run tests: `NODE_ENV=test pnpm test`

## Architecture

```
src/
  app.ts                 # Express application factory
  server.ts              # Bootstraps app and handles graceful shutdown
  config/                # Environment parsing and mailer factory
  controllers/           # HTTP request/response adapters
  db/                    # Prisma client singleton
  lib/                   # Cross-cutting utilities (crypto, jwt, mailer, errors, dates)
  middleware/            # Auth, validation, rate limiting, error handling
  repositories/          # Prisma data access
  routes/                # Route definitions
  services/              # Business logic
  types/                 # Shared TypeScript types
```

- **Controllers** are thin: parse input, call services, return responses.
- **Services** contain business rules and are unit-tested with mocked repositories.
- **Repositories** own Prisma queries and raw SQL where atomicity matters.
- **Middleware** handles cross-cutting concerns: JWT/API-key auth, Zod validation, rate limiting, and errors.

## Prerequisites

- Node.js >= 20
- pnpm
- PostgreSQL (real database required; migrations and integration paths use Prisma with the `pg` adapter)

## Environment setup

Never commit real secrets. Copy the example file and edit the copies:

```bash
# Development
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://api_limit:changeme@localhost:5432/api_limit
JWT_SECRET=replace-with-a-minimum-32-character-random-secret
JWT_ISSUER=api_limit
JWT_AUDIENCE=api_limit_users
ACCESS_TOKEN_TTL_MINUTES=15
MAIL_DRIVER=console
MAIL_FROM=noreply@example.com
RESET_PASSWORD_URL=http://localhost:3000/reset-password
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
LOG_LEVEL=info
```

For tests, create `.env.test` with the same shape but a separate database, for example `api_limit_test`, and `LOG_LEVEL=silent` to keep test output clean.

### Required variables

| Variable | Required | Notes |
|----------|----------|-------|
| `NODE_ENV` | Yes | `development`, `test`, or `production` |
| `PORT` | Yes | Defaults to `3000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Minimum 32 characters |
| `JWT_ISSUER` | Yes | Defaults to `api_limit` |
| `JWT_AUDIENCE` | Yes | Defaults to `api_limit_users` |
| `ACCESS_TOKEN_TTL_MINUTES` | Yes | Defaults to `15` |
| `MAIL_DRIVER` | Yes | `console` or `smtp` |
| `MAIL_FROM` | Yes | Valid email, defaults to `noreply@example.com` |
| `RESET_PASSWORD_URL` | In production | Required when `NODE_ENV=production` |
| `SMTP_HOST` | With `smtp` | Required when `MAIL_DRIVER=smtp` |
| `SMTP_PORT` | With `smtp` | Required when `MAIL_DRIVER=smtp` |
| `SMTP_SECURE` | No | Defaults to `false` |
| `SMTP_USER` | No | SMTP auth user |
| `SMTP_PASS` | No | SMTP auth password |
| `LOG_LEVEL` | No | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, or test-safe `silent`; defaults to `info` |
| `TRUST_PROXY` | No | `true`, `false`, a hop count number, or an IP/CIDR string; defaults to `false`. Set explicitly when running behind a proxy so IP-based rate limiting works without blindly trusting all headers. |

## pnpm scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Run with `tsx watch` |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled app |
| `pnpm test` | Run Vitest once |
| `pnpm test:watch` | Run Vitest in watch mode |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm lint` | Run Biome linter/formatter checks |
| `pnpm format` | Format with Biome |
| `pnpm prisma:generate` | Generate Prisma client |
| `pnpm prisma:migrate` | Run migrations in dev/test |
| `pnpm prisma:migrate:prod` | Deploy migrations in production |
| `pnpm prisma:studio` | Open Prisma Studio |

## Prisma workflow

```bash
# After pulling changes or editing schema.prisma
NODE_ENV=development pnpm prisma:generate

# Create/apply migrations during development
NODE_ENV=development pnpm prisma:migrate

# Deploy migrations in production
NODE_ENV=production pnpm prisma:migrate:prod
```

## Running the app

```bash
# Development with hot reload
NODE_ENV=development pnpm dev

# Production build and start
NODE_ENV=production pnpm build
NODE_ENV=production pnpm start

# Tests
NODE_ENV=test pnpm test
```

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`  | `/health` | None | Liveness check |
| `GET`  | `/health/ready` | None | Readiness check (queries database) |
| `POST` | `/auth/register` | None | Register a new user; sends verification code |
| `POST` | `/auth/login` | None | Login with verified email and password |
| `POST` | `/auth/verify-email` | None | Verify email with 6-digit code |
| `POST` | `/auth/resend-verification` | None | Resend verification code (1-minute cooldown) |
| `POST` | `/auth/forgot-password` | None | Request password reset link |
| `POST` | `/auth/reset-password` | None | Reset password with token |
| `GET`  | `/users/me` | JWT | Get current user profile |
| `PATCH`| `/users/me` | JWT | Update profile (`name`) |
| `POST` | `/users/me/change-password` | JWT | Change password and rotate token version |
| `POST` | `/api-keys` | JWT | Create a new API key |
| `GET`  | `/api-keys` | JWT | List active API keys |
| `DELETE`| `/api-keys/:id` | JWT | Revoke an API key |
| `GET`  | `/protected` | API key | Example protected resource; consumes daily quota |

Auth routes are protected by an IP+email rate limiter: 10 requests per 15-minute window.

## Authentication headers

- **JWT routes**: send `Authorization: Bearer <access_token>`.
- **API-key routes**: send `X-API-Key: <api_key>`.

## Email flows

### Verification

1. Register: `POST /auth/register` with `{ "email": "you@example.com", "password": "..." }`.
2. The server prints the 6-digit code to stdout when `MAIL_DRIVER=console`.
3. Submit: `POST /auth/verify-email` with `{ "email": "you@example.com", "code": "123456" }`.
4. Use `POST /auth/resend-verification` to request a new code (once per minute).

### Password reset

1. Request: `POST /auth/forgot-password` with `{ "email": "you@example.com" }`.
2. The server prints the reset URL to stdout when `MAIL_DRIVER=console`.
3. Submit: `POST /auth/reset-password` with `{ "token": "...", "password": "..." }`.

### SMTP

Set `MAIL_DRIVER=smtp` and provide `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASS` to send real email.

## Rate limiting

- Auth routes use a 15-minute sliding window per IP + email.
- `/protected` consumes a per-user quota of 100 requests per UTC day.
- The daily counter resets at the next UTC midnight.
- The `TRUST_PROXY` environment variable configures Express `trust proxy`. Keep it `false` unless the app runs behind a known proxy; then set it to the number of proxy hops (e.g., `1`) or a trusted subnet. This lets the IP-based auth rate limiter see the client IP without blindly trusting arbitrary headers.
- Response headers on `/protected`:
  - `X-RateLimit-Limit`: 100
  - `X-RateLimit-Remaining`: requests left today
  - `X-RateLimit-Reset`: Unix timestamp of the next UTC midnight

## curl examples

```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"Password123"}'

# Login (requires verified email)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"Password123"}'

# Create an API key
curl -X POST http://localhost:3000/api-keys \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-key"}'

# Access protected resource
curl -i http://localhost:3000/protected \
  -H "X-API-Key: <api_key>"
```

## Security notes

- Store `JWT_SECRET` in a secret manager in production; it must be at least 32 characters.
- Use HTTPS in production and configure `helmet` via standard Express best practices.
- API keys are hashed with SHA-256 before storage; only the plaintext is shown once on creation.
- Password reset tokens are hashed before storage and expire after 15 minutes.
- Verification codes are hashed before storage, allow 5 attempts, and expire after 30 minutes.
- `pino-http` redacts `authorization`, `cookie`, `password`, `token`, and `code` fields from logs.

## Integration-test caveat

The test suite in this repository is designed to run without a live Postgres instance. Repository-level tests use mocked Prisma clients, and route tests mock services. To run real integration tests against Postgres, spin up a database, set `DATABASE_URL` in `.env.test`, run `NODE_ENV=test pnpm prisma:migrate`, and add dedicated integration tests that call Prisma directly.
