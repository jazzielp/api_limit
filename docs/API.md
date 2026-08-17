# api_limit API reference

`api_limit` is an Express 5 JSON API for account registration, email verification,
password-based login, profile management, API-key management, and an API-key-authenticated
job-offer parsing resource with a per-user daily quota.

## At a glance

| Item | Value |
|---|---|
| Local base URL | `http://localhost:3000` by default |
| API version prefix | None |
| Request content type | `application/json` for requests with a body |
| Response format | JSON, except successful `204 No Content` responses |
| Interactive documentation | `/docs` |
| OpenAPI 3.1 contract | `/openapi.json` |
| Account authentication | `Authorization: Bearer <access-token>` |
| Job-offer-resource authentication | `X-API-Key: <api-key>` |
| Daily job-offer-resource quota | 100 requests per user per UTC day |

The deployment operator defines the production base URL. Paths in this document are relative to
that URL.

## Contents

- [Quick start](#quick-start)
- [Authentication](#authentication)
- [Endpoint summary](#endpoint-summary)
- [Rate limits](#rate-limits)
- [Validation and errors](#validation-and-errors)
- [Email verification and password reset](#email-verification-and-password-reset)
- [Environment reference](#environment-reference)
- [Local development](#local-development)

## Quick start

1. Install dependencies and prepare the database as described in the [local development](#local-development) section.
2. Start the API with `pnpm dev`.
3. Open `http://localhost:3000/docs` for the interactive Scalar API Reference, or retrieve the machine-readable
   contract from `http://localhost:3000/openapi.json`.
4. Confirm liveness and database readiness:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
```

A ready instance returns:

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{
  "status": "ready",
  "checks": {
    "database": "ok"
  }
}
```

Registration does not immediately produce an access token. The account must complete email
verification before it can log in:

```bash
curl -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"Password123"}'

curl -X POST http://localhost:3000/auth/verify-email \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","code":"123456"}'

curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"Password123"}'
```

With the returned JWT, create an API key and use it on the job-offer resource:

```bash
curl -X POST http://localhost:3000/api-keys \
  -H 'Authorization: Bearer <access-token>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"production-client"}'

curl -i -X POST http://localhost:3000/job-offers/parse \
  -H 'X-API-Key: <api-key>' \
  -H 'Content-Type: application/json' \
  -d '{"text":"Senior Backend Engineer at Acme Corp. Node.js, TypeScript, PostgreSQL."}'
```

## Authentication

### JWT access tokens

Use a JWT for `/users/*` and `/api-keys/*`:

```http
Authorization: Bearer <access-token>
```

The token is returned only by `POST /auth/login`. Login requires a verified email address. Tokens
expire after `ACCESS_TOKEN_TTL_MINUTES` and are checked against the configured issuer and audience.
There is no refresh-token endpoint.

Changing or resetting a password increments the account's token version and invalidates all JWTs
issued before that change. An invalidated token returns `401` with a distinct error code:

```json
{
  "error": {
    "message": "Invalid or expired token",
    "code": "TOKEN_VERSION_MISMATCH"
  }
}
```

Log in again with the new password to obtain a usable token.

Malformed or expired tokens return `401`:

```json
{
  "error": {
    "message": "Invalid or expired token",
    "code": "UNAUTHORIZED"
  }
}
```

A missing header or one that does not start with `Bearer ` returns:

```json
{
  "error": {
    "message": "Missing or invalid authorization header",
    "code": "UNAUTHORIZED"
  }
}
```

### API keys

Use an API key only for `/job-offers/*`:

```http
X-API-Key: apk_<key-material>
```

Create, list, and revoke API keys with a JWT. The plaintext key appears once in the create response;
the server stores only its SHA-256 hash, and list responses never contain it. A missing key returns
`401` with `Missing API key`; an unknown or revoked key returns `401` with `Invalid API key`. Both use
the `UNAUTHORIZED` error code.

Password changes do not revoke API keys. Revoke keys explicitly with `DELETE /api-keys/:id`.

## Endpoint summary

| Method | Path | Authentication | Success |
|---|---|---|---|
| `GET` | `/health` | None | `200` |
| `GET` | `/health/ready` | None | `200` |
| `POST` | `/auth/register` | None | `201` |
| `POST` | `/auth/login` | None | `200` |
| `POST` | `/auth/verify-email` | None | `200` |
| `POST` | `/auth/resend-verification` | None | `200` |
| `POST` | `/auth/forgot-password` | None | `204` |
| `POST` | `/auth/reset-password` | None | `204` |
| `GET` | `/users/me` | JWT | `200` |
| `PATCH` | `/users/me` | JWT | `200` |
| `POST` | `/users/me/change-password` | JWT | `204` |
| `POST` | `/api-keys` | JWT | `201` |
| `GET` | `/api-keys` | JWT | `200` |
| `DELETE` | `/api-keys/:id` | JWT | `204` |
| `POST` | `/job-offers/parse` | API key | `200` |

All six `/auth/*` endpoints also use the [authentication-attempt rate limit](#authentication-attempt-limit).

## Health endpoints

### `GET /health`

Returns process liveness. It does not query the database.

**Request**

```bash
curl http://localhost:3000/health
```

**Response: `200 OK`**

```json
{
  "status": "ok"
}
```

### `GET /health/ready`

Runs `SELECT 1` against PostgreSQL and reports whether the API is ready to serve database-backed
requests.

**Request**

```bash
curl http://localhost:3000/health/ready
```

**Response: `200 OK`**

```json
{
  "status": "ready",
  "checks": {
    "database": "ok"
  }
}
```

**Response: `503 Service Unavailable`**

```json
{
  "status": "not ready",
  "checks": {
    "database": "unavailable"
  }
}
```

## Account and authentication endpoints

### `POST /auth/register`

Creates an unverified account and sends a six-digit verification code.

**Request body**

| Field | Type | Rules |
|---|---|---|
| `email` | string | Required; valid email address |
| `password` | string | Required; at least 8 characters |

Accepted email addresses are stored lowercase. Validation occurs before normalization, so an
otherwise valid address padded with whitespace is rejected rather than trimmed and accepted.

```json
{
  "email": "alice@example.com",
  "password": "Password123"
}
```

**Response: `201 Created`**

```json
{
  "id": "4da7a04e-e5c7-42c9-8e5a-bf98f1a5352e",
  "email": "alice@example.com",
  "createdAt": "2026-08-07T18:00:00.000Z"
}
```

The response does not contain a token. Complete email verification, then log in.

**Response: `409 Conflict`**

```json
{
  "error": {
    "message": "Email already registered",
    "code": "CONFLICT"
  }
}
```

### `POST /auth/login`

Authenticates a verified account and returns a JWT.

**Request body**

| Field | Type | Rules |
|---|---|---|
| `email` | string | Required; valid email address |
| `password` | string | Required; at least 8 characters |

```json
{
  "email": "alice@example.com",
  "password": "Password123"
}
```

**Response: `200 OK`**

```json
{
  "token": "<signed-jwt>",
  "user": {
    "id": "4da7a04e-e5c7-42c9-8e5a-bf98f1a5352e",
    "email": "alice@example.com",
    "emailVerifiedAt": "2026-08-07T18:02:00.000Z"
  }
}
```

Invalid email/password combinations return the same response to avoid disclosing whether an account
exists:

**Response: `401 Unauthorized`**

```json
{
  "error": {
    "message": "Invalid credentials",
    "code": "UNAUTHORIZED"
  }
}
```

**Response: `403 Forbidden`**

```json
{
  "error": {
    "message": "Email not verified. Please verify your email before logging in.",
    "code": "EMAIL_NOT_VERIFIED"
  }
}
```

### `POST /auth/verify-email`

Verifies an account with the code sent during registration or by the resend endpoint.

**Request body**

| Field | Type | Rules |
|---|---|---|
| `email` | string | Required; valid email address |
| `code` | string | Required; exactly 6 characters |

```json
{
  "email": "alice@example.com",
  "code": "123456"
}
```

**Response: `200 OK`**

```json
{
  "message": "Email verified"
}
```

For privacy and idempotence, an unknown email, an already verified account, or an account without an
active verification record also receives this `200` response.

Codes expire after 30 minutes and allow five failed verification attempts. A wrong code before the
attempts are exhausted returns:

```json
{
  "error": {
    "message": "Invalid verification code",
    "code": "VALIDATION_ERROR"
  }
}
```

An expired code or exhausted attempt count returns `400` with `Invalid or expired verification code`
and the same `VALIDATION_ERROR` code.

### `POST /auth/resend-verification`

Replaces the active verification code and resets its expiration and five-attempt allowance.

**Request body**

```json
{
  "email": "alice@example.com"
}
```

`email` is required and must be a valid email address.

**Response: `200 OK`**

```json
{
  "message": "If your email is registered, a new code has been sent"
}
```

The same response is returned for unknown emails and already verified accounts. For an unverified
account, resends have an additional one-minute cooldown:

**Response: `429 Too Many Requests`**

```json
{
  "error": {
    "message": "Please wait before resending",
    "code": "RATE_LIMIT_EXCEEDED"
  }
}
```

This service-level cooldown response does **not** include `Retry-After`. The same operation can also
return `429` from the shared authentication-attempt limiter; only that limiter response includes
`Retry-After`.

### `POST /auth/forgot-password`

Creates a single-use password-reset token and sends a reset URL if the account exists.

**Request body**

```json
{
  "email": "alice@example.com"
}
```

`email` is required and must be a valid email address.

**Response: `204 No Content`**

The response has no body. Unknown and registered emails receive the same response. Requesting a new
reset deletes any earlier unused reset token for the account. The new token expires after 15 minutes.

### `POST /auth/reset-password`

Consumes a password-reset token and sets a new password.

**Request body**

| Field | Type | Rules |
|---|---|---|
| `token` | string | Required; at least 1 character |
| `password` | string | Required; at least 8 characters |

```json
{
  "token": "<reset-token-from-email>",
  "password": "NewPassword123"
}
```

**Response: `204 No Content`**

The response has no body. A successful reset invalidates all unused reset tokens for the account and
all JWTs issued before the reset.

**Response: `400 Bad Request`**

```json
{
  "error": {
    "message": "Invalid or expired reset token",
    "code": "VALIDATION_ERROR"
  }
}
```

## User endpoints

All user endpoints require a JWT in the `Authorization` header.

### `GET /users/me`

Returns the current account profile.

**Request**

```bash
curl http://localhost:3000/users/me \
  -H 'Authorization: Bearer <access-token>'
```

**Response: `200 OK`**

```json
{
  "id": "4da7a04e-e5c7-42c9-8e5a-bf98f1a5352e",
  "email": "alice@example.com",
  "name": "Alice",
  "emailVerifiedAt": "2026-08-07T18:02:00.000Z",
  "createdAt": "2026-08-07T18:00:00.000Z",
  "updatedAt": "2026-08-07T18:05:00.000Z"
}
```

`name` can be `null` when it has not been set.

### `PATCH /users/me`

Updates the current account's display name.

**Request body**

| Field | Type | Rules |
|---|---|---|
| `name` | string | Optional; when present, at least 1 character |

```json
{
  "name": "Alice Smith"
}
```

**Response: `200 OK`**

```json
{
  "id": "4da7a04e-e5c7-42c9-8e5a-bf98f1a5352e",
  "email": "alice@example.com",
  "name": "Alice Smith",
  "emailVerifiedAt": "2026-08-07T18:02:00.000Z",
  "createdAt": "2026-08-07T18:00:00.000Z",
  "updatedAt": "2026-08-07T18:10:00.000Z"
}
```

Sending `null` or an empty string for `name` is invalid. The API currently accepts an empty object as
a no-op update.

### `POST /users/me/change-password`

Changes the password after checking the current password.

**Request body**

| Field | Type | Rules |
|---|---|---|
| `currentPassword` | string | Required; at least 1 character |
| `newPassword` | string | Required; at least 8 characters |

```json
{
  "currentPassword": "Password123",
  "newPassword": "NewPassword123"
}
```

**Response: `204 No Content`**

The response has no body. All existing JWTs, including the token used for this request, are invalid
after the change.

**Response: `401 Unauthorized`**

```json
{
  "error": {
    "message": "Invalid current password",
    "code": "UNAUTHORIZED"
  }
}
```

## API-key endpoints

All API-key lifecycle endpoints require a JWT in the `Authorization` header.

### `POST /api-keys`

Creates an API key for the current account.

**Request body**

```json
{
  "name": "production-client"
}
```

`name` is required and must contain at least one character.

**Response: `201 Created`**

```json
{
  "id": "83cd2ba5-58a9-43ce-b501-61388152c3d9",
  "name": "production-client",
  "key": "apk_<key-material>",
  "createdAt": "2026-08-07T18:15:00.000Z"
}
```

Store `key` securely when it is returned. It cannot be recovered through the API.

### `GET /api-keys`

Lists the current account's active, non-revoked API keys, newest first.

**Request**

```bash
curl http://localhost:3000/api-keys \
  -H 'Authorization: Bearer <access-token>'
```

**Response: `200 OK`**

```json
[
  {
    "id": "83cd2ba5-58a9-43ce-b501-61388152c3d9",
    "name": "production-client",
    "createdAt": "2026-08-07T18:15:00.000Z",
    "lastUsedAt": "2026-08-07T18:16:00.000Z"
  },
  {
    "id": "f1797df7-e6e1-4f78-b8b8-131f69546cd9",
    "name": "unused-client",
    "createdAt": "2026-08-07T18:12:00.000Z",
    "lastUsedAt": null
  }
]
```

An account with no active keys receives `[]`. Key use updates `lastUsedAt` at most once per minute,
so this timestamp is approximate rather than a request-level audit log.

### `DELETE /api-keys/:id`

Revokes one of the current account's API keys. Use an `id` returned by `GET /api-keys`.

**Request**

```bash
curl -X DELETE http://localhost:3000/api-keys/83cd2ba5-58a9-43ce-b501-61388152c3d9 \
  -H 'Authorization: Bearer <access-token>'
```

**Response: `204 No Content`**

The response has no body. The revoked key immediately stops authenticating and is omitted from future
list responses.

**Response: `404 Not Found`**

```json
{
  "error": {
    "message": "API key not found",
    "code": "NOT_FOUND"
  }
}
```

The same `404` applies when the key does not exist or belongs to another account. Revoking an already
revoked key is idempotent and returns `204`.

## Job offers

### `POST /job-offers/parse`

Authenticates an API key, consumes one request from the owning user's daily quota, and returns the
job offer as structured fields.

> **Parsing is not implemented yet.** The endpoint validates the request and returns a fixed
> simulated job offer; the submitted `text` is currently ignored. The response shape below is the
> contract real parsing will fill in, so clients can integrate against it today.

**Request**

```bash
curl -i -X POST http://localhost:3000/job-offers/parse \
  -H 'X-API-Key: <api-key>' \
  -H 'Content-Type: application/json' \
  -d '{"text":"Senior Backend Engineer at Acme Corp. Node.js, TypeScript, PostgreSQL."}'
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `text` | string | Yes | 1 to 20000 characters |

**Response: `200 OK`**

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1786147200
Content-Type: application/json; charset=utf-8

{
  "jobTitle": "Senior Backend Engineer",
  "company": "Acme Corp",
  "mainResponsibilities": [
    "Design and maintain REST APIs",
    "Review pull requests and mentor mid-level engineers",
    "Own service reliability and observability"
  ],
  "requiredTechnologies": ["Node.js", "TypeScript", "PostgreSQL"],
  "optionalTechnologies": ["Docker", "Kubernetes", "Redis"],
  "languages": ["English", "Spanish"],
  "workMode": "Hybrid",
  "salary": "USD 60,000 - 80,000 per year",
  "benefits": ["Health insurance", "Annual training budget", "20 paid vacation days"]
}
```

Every field is always present. `jobTitle`, `company`, `workMode`, and `salary` are `string | null`;
the four remaining fields are always arrays of strings, empty when nothing is found.

The numeric header values above are examples. `X-RateLimit-Reset` changes with the next UTC midnight.

**Response: `400 Bad Request`**

Returned when `text` is missing, empty, not a string, or longer than 20000 characters. Validation
runs before quota consumption, so a rejected request does not count against the daily limit.

**Response: `429 Too Many Requests`**

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1786147200
Content-Type: application/json; charset=utf-8

{
  "error": {
    "message": "Daily rate limit exceeded",
    "code": "RATE_LIMIT_EXCEEDED"
  }
}
```

## Rate limits

### Authentication-attempt limit

Every request to an `/auth/*` endpoint counts toward a limit of 10 requests per 15-minute window.
Successful requests are not excluded. The key combines Express's client IP with the request body's
`email` value. Correct `TRUST_PROXY` configuration is therefore important when the API is behind a
known reverse proxy.

This is a fixed-window limit backed by `express-rate-limit`'s default in-memory store. Counters are
local to one Node.js process, reset when that process restarts, and are not shared across processes
or application instances. A multi-instance deployment therefore needs a shared store to enforce a
global auth-attempt limit.

Responses from these routes include standard rate-limit headers generated by `express-rate-limit`:

```http
RateLimit-Policy: 10;w=900
RateLimit-Limit: 10
RateLimit-Remaining: 9
RateLimit-Reset: 900
```

Legacy `X-RateLimit-*` headers are disabled for auth routes. The separate daily quota on
`POST /job-offers/parse` uses the custom `X-RateLimit-*` headers documented below.

`RateLimit-Remaining` and `RateLimit-Reset` vary by request. When the limit is exceeded,
`express-rate-limit` also emits `Retry-After`, measured in whole seconds until the current fixed
window resets. It is `900` when observed at the start of a new 15-minute window and decreases with
elapsed time:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 900

{
  "error": {
    "message": "Too many attempts. Please try again after 15 minutes.",
    "code": "RATE_LIMIT_EXCEEDED"
  }
}
```

The resend-verification one-minute cooldown is a separate service rule and can return its own `429`
before this shared auth-route limit is reached. That cooldown does not set `Retry-After`; clients
must not infer that header unless it is actually present.

### Daily API-key limit

`POST /job-offers/parse` allows 100 successful requests per user per UTC calendar day. All active API keys
owned by the same user share one counter. The counter operation is serialized in PostgreSQL so
concurrent requests cannot bypass the quota.

The 100th request succeeds with `X-RateLimit-Remaining: 0`. Later requests return `429` and do not
increase the counter. The quota resets at the next UTC midnight.

| Header | Meaning |
|---|---|
| `X-RateLimit-Limit` | Daily limit; currently `100` |
| `X-RateLimit-Remaining` | Successful requests remaining in the current UTC day |
| `X-RateLimit-Reset` | Unix timestamp in seconds for the next UTC midnight |

These `X-RateLimit-*` headers are returned on successful and daily-limit-exceeded
`/job-offers/parse` responses. API-key authentication and body-validation failures occur before
quota consumption and do not include them.

## Validation and errors

### Validation

Request bodies are validated with Zod. Unknown object fields are removed before the controller sees
the body. Validation failures return `400 Bad Request`:

```json
{
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "issues": [
      {
        "path": ["email"],
        "message": "Invalid email address"
      },
      {
        "path": ["password"],
        "message": "Too small: expected string to have >=8 characters"
      }
    ]
  }
}
```

Each issue has a `path` array and a Zod-generated `message`. Clients should use `path` for field
association and should not depend on validation message wording remaining stable across dependency
upgrades.

### Error envelope

Application errors use this shape:

```json
{
  "error": {
    "message": "Human-readable message",
    "code": "MACHINE_READABLE_CODE"
  }
}
```

Validation errors add `error.issues`. Implemented machine-readable codes are:

| Code | Typical status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | `400` | Invalid request fields, verification code, or reset token |
| `UNAUTHORIZED` | `401` | Missing or invalid JWT/API key, invalid login, or wrong current password |
| `TOKEN_VERSION_MISMATCH` | `401` | JWT invalidated by a password change or reset |
| `EMAIL_NOT_VERIFIED` | `403` | Correct login credentials but email verification is incomplete |
| `NOT_FOUND` | `404` | User or API key was not found for the authenticated account |
| `CONFLICT` | `409` | Registration email is already in use |
| `RATE_LIMIT_EXCEEDED` | `429` | Auth-attempt, resend, or daily quota limit exceeded |
| `INTERNAL_ERROR` | `500` | Unexpected server failure |

An unexpected failure is sanitized:

```json
{
  "error": {
    "message": "Internal server error",
    "code": "INTERNAL_ERROR"
  }
}
```

There is no custom unmatched-route handler. A request to an unknown path receives Express's default
`404` response rather than the JSON application-error envelope.

## Email verification and password reset

### Delivery modes

`MAIL_DRIVER=console` writes verification codes and reset URLs to server stdout for local development.
It does not send email. `MAIL_DRIVER=smtp` sends email through the configured SMTP server.

Verification properties:

| Property | Behavior |
|---|---|
| Code format | Six-digit string |
| Lifetime | 30 minutes |
| Failed attempts | 5 |
| Resend cooldown | 1 minute |
| Resend effect | Replaces the code and restores its lifetime and attempt count |

Password-reset properties:

| Property | Behavior |
|---|---|
| Token lifetime | 15 minutes |
| Reuse | Single use |
| New request | Deletes earlier unused tokens for that account |
| Successful reset | Marks all unused tokens used and invalidates existing JWTs |
| Disclosure protection | Forgot-password returns `204` whether or not the email exists |

The server builds the email link by adding a `token` query parameter to `RESET_PASSWORD_URL`. The
frontend at that URL must read the token and submit it to `POST /auth/reset-password`.

## Environment reference

Do not commit environment files or real credentials. The packaged `pnpm start` command always loads
a physical `.env` file because it invokes `node --env-file=.env`; keep that file outside source
control and provision it securely. To use environment variables injected directly by a deployment
platform or secret manager without a physical file, bypass that script after building:

```bash
NODE_ENV=production node dist/server.js
```

| Variable | Requirement | Default and constraints |
|---|---|---|
| `NODE_ENV` | Optional | `development`; accepts `development`, `test`, or `production` |
| `PORT` | Optional | `3000`; integer from 1 to 65535 |
| `DATABASE_URL` | Required | Non-empty PostgreSQL connection string |
| `JWT_SECRET` | Required, secret | At least 32 characters |
| `JWT_ISSUER` | Optional | `api_limit` |
| `JWT_AUDIENCE` | Optional | `api_limit_users` |
| `ACCESS_TOKEN_TTL_MINUTES` | Optional | `15`; positive integer |
| `MAIL_DRIVER` | Optional | `console`; accepts `console` or `smtp` |
| `MAIL_FROM` | Optional | `noreply@example.com`; valid email address |
| `RESET_PASSWORD_URL` | Required in production | Valid absolute URL; local fallback is `http://localhost:3000/reset-password` outside production |
| `SMTP_HOST` | Required with SMTP | Non-empty when `MAIL_DRIVER=smtp` |
| `SMTP_PORT` | Required with SMTP | Integer from 1 to 65535 |
| `SMTP_SECURE` | Optional | Defaults to `false` when omitted; see note below |
| `SMTP_USER` | Optional | SMTP authentication username |
| `SMTP_PASS` | Optional, secret | SMTP authentication password |
| `LOG_LEVEL` | Optional | `info`; accepts `trace`, `debug`, `info`, `warn`, `error`, `fatal`, or `silent` |
| `TRUST_PROXY` | Optional | `false`; accepts `true`, `false`, a numeric hop count, or an Express trust-proxy string |

`SMTP_SECURE` currently uses JavaScript boolean coercion. Because environment values are strings,
omit the variable for `false`; a non-empty value, including the string `"false"`, is coerced to `true`.
Set `SMTP_SECURE=true` only for implicit TLS immediately on connection. When it is omitted, the
connection starts without TLS and Nodemailer may upgrade it with STARTTLS when the server supports
it.

In production, set `TRUST_PROXY` to the narrowest value matching the actual proxy topology. Leaving
it false behind a proxy can group clients under the proxy IP for auth throttling; blindly trusting
forwarded headers lets clients spoof their IP.

## Local development

Prerequisites are Node.js 22.12.0 or newer, pnpm, and PostgreSQL. The package scripts select their own
environment file; consult `.env.example` for placeholders, but never place real secrets in source
control.

```bash
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

Useful verification commands:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

| Command | Purpose |
|---|---|
| `pnpm dev` | Run the TypeScript server in watch mode with development configuration |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run the compiled production server |
| `pnpm test` | Run Vitest once with test configuration |
| `pnpm test:watch` | Run Vitest in watch mode |
| `pnpm typecheck` | Type-check without emitting files |
| `pnpm lint` | Run Biome checks |
| `pnpm format` | Format files with Biome |
| `pnpm prisma:generate` | Generate the Prisma client |
| `pnpm prisma:migrate` | Create and apply development migrations |
| `pnpm prisma:migrate:prod` | Apply existing migrations in production |
| `pnpm prisma:studio` | Open Prisma Studio |

`pnpm prisma:migrate` always loads `.env.development`; it does not migrate the test database. To
apply existing migrations to the database configured in `.env.test`, run:

```bash
NODE_ENV=test node --env-file=.env.test node_modules/prisma/build/index.js migrate deploy
```

### Testing caveat

The current tests are primarily unit and route tests. Services and repositories use mocks, and route
tests mock database-backed dependencies. The readiness route test also mocks Prisma. Running the test
suite therefore does not prove connectivity, migration state, SQL behavior, or complete end-to-end
authentication against a real PostgreSQL instance.

For deployment readiness, apply migrations to the target database and verify `GET /health/ready`
against the running instance. Add dedicated integration tests when database-level behavior must be
exercised automatically.
