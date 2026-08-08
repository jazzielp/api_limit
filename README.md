# api_limit

Express 5 + TypeScript API with JWT authentication, email verification, password reset, API keys, and a per-user 100-request daily rate limit.

> **API consumers:** Use the interactive Swagger UI at `/docs`, the OpenAPI 3.1 contract at
> `/openapi.json`, or the comprehensive [API reference](docs/API.md).

## Quick path

1. Install dependencies: `pnpm install`
2. Copy `.env.example` to `.env.development` and `.env.test` and fill in placeholders.
3. Generate the Prisma client: `pnpm prisma:generate`
4. Run migrations against a real Postgres database: `pnpm prisma:migrate`
5. Start the server: `pnpm dev`
6. Run tests: `pnpm test`

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

> **Environment loading:** Each `package.json` script selects a specific file. Development and Prisma development scripts load `.env.development`, tests load `.env.test`, and production start/migration scripts load `.env`. Each script also sets `NODE_ENV` explicitly.

### Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `NODE_ENV` | No | Defaults to `development`; scripts set it explicitly |
| `PORT` | No | Defaults to `3000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Minimum 32 characters |
| `JWT_ISSUER` | No | Defaults to `api_limit` |
| `JWT_AUDIENCE` | No | Defaults to `api_limit_users` |
| `ACCESS_TOKEN_TTL_MINUTES` | No | Defaults to `15` |
| `MAIL_DRIVER` | No | `console` or `smtp`; defaults to `console` |
| `MAIL_FROM` | No | Valid email; defaults to `noreply@example.com` |
| `RESET_PASSWORD_URL` | In production | Required when `NODE_ENV=production` |
| `SMTP_HOST` | With `smtp` | Required when `MAIL_DRIVER=smtp` |
| `SMTP_PORT` | With `smtp` | Required when `MAIL_DRIVER=smtp` |
| `SMTP_SECURE` | No | Omit for false; see [SMTP configuration](#smtp-configuration) |
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
| `pnpm prisma:migrate` | Create and apply migrations using `.env.development` |
| `pnpm prisma:migrate:prod` | Deploy migrations in production |
| `pnpm prisma:studio` | Open Prisma Studio |

## Prisma workflow

```bash
# After pulling changes or editing schema.prisma
pnpm prisma:generate

# Create/apply migrations during development
pnpm prisma:migrate

# Deploy migrations in production
pnpm prisma:migrate:prod
```

## Running the app

```bash
# Development with hot reload
pnpm dev

# Production build and start
pnpm build
pnpm start

# Tests
pnpm test
```

`pnpm start` requires a physical `.env` file because the script uses `node --env-file=.env`. Keep
that file out of source control and provision it securely. If the deployment platform injects
production variables directly, bypass the package script after building:

```bash
NODE_ENV=production node dist/server.js
```

## API usage

Registration, verification, and login use `/auth/*`. JWT-authenticated `/users/*` and `/api-keys/*`
routes require `Authorization: Bearer <access-token>`. The sample `/protected` resource requires
`X-API-Key: <api-key>`.

With the server running, open `http://localhost:3000/docs` for interactive Swagger UI or fetch the
machine-readable contract from `http://localhost:3000/openapi.json`. Both documentation endpoints
are public and contain placeholders only, never runtime secrets.

See the [API reference](docs/API.md) for the endpoint summary, request and response examples, email
flows, authentication failures including `TOKEN_VERSION_MISMATCH`, and the complete error contract.

## SMTP configuration

Set `MAIL_DRIVER=smtp` and provide `SMTP_HOST` and `SMTP_PORT`. Add `SMTP_USER` and `SMTP_PASS` when
the server requires authentication.

Omit `SMTP_SECURE` for false. The current coercion treats any non-empty string, including `false`, as
true. Set `SMTP_SECURE=true` only for implicit TLS immediately on connection. With false or omitted,
Nodemailer starts without TLS and may upgrade the connection with STARTTLS when supported.

## Rate limiting

- Auth routes use a fixed 15-minute window with 10 requests per IP + request-body email. The default
  in-memory counters are process-local, reset on restart, and are not shared between instances.
- Auth responses use the standard `RateLimit-Policy`, `RateLimit-Limit`, `RateLimit-Remaining`, and
  `RateLimit-Reset` headers. Legacy `X-RateLimit-*` auth headers are disabled.
- Auth-limit `429` responses also include `Retry-After`, in seconds until the 15-minute fixed window
  resets (`900` at window start). The separate resend-verification service cooldown does not set it.
- `/protected` consumes a per-user quota of 100 requests per UTC day.
- The daily counter resets at the next UTC midnight.
- The `TRUST_PROXY` environment variable configures Express `trust proxy`. Keep it `false` unless the app runs behind a known proxy; then set it to the number of proxy hops (e.g., `1`) or a trusted subnet. This lets the IP-based auth rate limiter see the client IP without blindly trusting arbitrary headers.
- Response headers on `/protected`:
  - `X-RateLimit-Limit`: 100
  - `X-RateLimit-Remaining`: requests left today
  - `X-RateLimit-Reset`: Unix timestamp of the next UTC midnight

## Security notes

- Store `JWT_SECRET` in a secret manager in production; it must be at least 32 characters.
- Use HTTPS in production. Helmet security headers are already enabled for all routes.
- API keys are hashed with SHA-256 before storage; only the plaintext is shown once on creation.
- Password reset tokens are hashed before storage and expire after 15 minutes.
- Verification codes are hashed before storage, allow 5 attempts, and expire after 30 minutes.
- `pino-http` redacts `authorization`, `cookie`, `password`, `token`, and `code` fields from logs.

## Integration-test caveat

The test suite in this repository is designed to run without a live Postgres instance. Repository-level tests use mocked Prisma clients, and route tests mock services. `pnpm prisma:migrate` always loads `.env.development`; it does not migrate the test database. To apply existing migrations to a separate database configured in `.env.test`, run:

```bash
NODE_ENV=test node --env-file=.env.test node_modules/prisma/build/index.js migrate deploy
```

Then add dedicated integration tests that call Prisma directly.
