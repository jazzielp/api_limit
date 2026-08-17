const jsonContent = (schema: Readonly<Record<string, unknown>>) => ({
  "application/json": { schema },
});

const authRateLimitHeaders = {
  "RateLimit-Policy": { $ref: "#/components/headers/RateLimitPolicy" },
  "RateLimit-Limit": { $ref: "#/components/headers/RateLimitLimit" },
  "RateLimit-Remaining": { $ref: "#/components/headers/RateLimitRemaining" },
  "RateLimit-Reset": { $ref: "#/components/headers/RateLimitReset" },
};

const authRateLimitedHeaders = {
  ...authRateLimitHeaders,
  "Retry-After": { $ref: "#/components/headers/RetryAfter" },
};

const dailyRateLimitHeaders = {
  "X-RateLimit-Limit": { $ref: "#/components/headers/DailyRateLimit" },
  "X-RateLimit-Remaining": { $ref: "#/components/headers/DailyRateLimitRemaining" },
  "X-RateLimit-Reset": { $ref: "#/components/headers/DailyRateLimitReset" },
};

const jsonResponse = (
  description: string,
  schema: Readonly<Record<string, unknown>>,
  headers?: Readonly<Record<string, unknown>>,
) => ({
  description,
  ...(headers === undefined ? {} : { headers }),
  content: jsonContent(schema),
});

const authJsonResponse = (description: string, schema: Readonly<Record<string, unknown>>) =>
  jsonResponse(description, schema, authRateLimitHeaders);

const requestBody = (schemaName: string) => ({
  required: true,
  content: jsonContent({ $ref: `#/components/schemas/${schemaName}` }),
});

const errorResponse = (description: string) =>
  jsonResponse(description, { $ref: "#/components/schemas/ErrorResponse" });

const validationErrorResponse = jsonResponse("Invalid request or token data", {
  $ref: "#/components/schemas/ValidationErrorResponse",
});
const bearerUnauthorizedResponse = errorResponse("Missing, invalid, expired, or invalidated JWT");
const internalErrorResponse = errorResponse("Unexpected server error");
const authRateLimitedResponse = jsonResponse(
  "Authentication attempt rate limit exceeded. Retry-After is the number of seconds until the 15-minute fixed window resets.",
  { $ref: "#/components/schemas/ErrorResponse" },
  authRateLimitedHeaders,
);

const authCommonResponses = {
  "400": authJsonResponse("Request validation failed", {
    $ref: "#/components/schemas/BadRequestErrorResponse",
  }),
  "429": authRateLimitedResponse,
  "500": authJsonResponse("Unexpected server error", {
    $ref: "#/components/schemas/ErrorResponse",
  }),
};

export const openApiDocument: Readonly<Record<string, unknown>> = {
  openapi: "3.1.0",
  info: {
    title: "api_limit API",
    version: "1.0.0",
    description:
      "Account authentication, API-key management, and an API-key-authenticated job-offer parsing resource with a per-user daily quota.",
  },
  servers: [{ url: "/", description: "Current server" }],
  tags: [
    { name: "Health" },
    { name: "Authentication" },
    { name: "Users" },
    { name: "API keys" },
    { name: "Job offers" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Check process liveness",
        operationId: "getHealth",
        responses: {
          "200": jsonResponse("The process is running", {
            $ref: "#/components/schemas/HealthResponse",
          }),
          "500": internalErrorResponse,
        },
      },
    },
    "/health/ready": {
      get: {
        tags: ["Health"],
        summary: "Check database readiness",
        operationId: "getReadiness",
        responses: {
          "200": jsonResponse("The database is reachable", {
            $ref: "#/components/schemas/ReadyResponse",
          }),
          "503": jsonResponse("The database is unavailable", {
            $ref: "#/components/schemas/NotReadyResponse",
          }),
        },
      },
    },
    "/auth/register": {
      post: {
        tags: ["Authentication"],
        summary: "Register an account",
        description:
          "Creates an unverified account and sends a six-character verification code. This route is limited to 10 attempts per client IP and email per 15 minutes.",
        operationId: "register",
        requestBody: requestBody("RegisterRequest"),
        responses: {
          "201": authJsonResponse("Account created", {
            $ref: "#/components/schemas/RegisteredUser",
          }),
          ...authCommonResponses,
          "409": authJsonResponse("Email is already registered", {
            $ref: "#/components/schemas/ErrorResponse",
          }),
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Log in",
        description:
          "Authenticates a verified account and returns a JWT. This route is limited to 10 attempts per client IP and email per 15 minutes.",
        operationId: "login",
        requestBody: requestBody("LoginRequest"),
        responses: {
          "200": authJsonResponse("Authenticated", {
            $ref: "#/components/schemas/LoginResponse",
          }),
          ...authCommonResponses,
          "401": authJsonResponse("Invalid credentials", {
            $ref: "#/components/schemas/ErrorResponse",
          }),
          "403": authJsonResponse("Email has not been verified", {
            $ref: "#/components/schemas/ErrorResponse",
          }),
        },
      },
    },
    "/auth/verify-email": {
      post: {
        tags: ["Authentication"],
        summary: "Verify an email address",
        description:
          "Unknown emails and already verified accounts receive the same success response. This route is limited to 10 attempts per client IP and email per 15 minutes.",
        operationId: "verifyEmail",
        requestBody: requestBody("VerifyEmailRequest"),
        responses: {
          "200": authJsonResponse("Email verified or no action required", {
            $ref: "#/components/schemas/EmailVerifiedResponse",
          }),
          ...authCommonResponses,
        },
      },
    },
    "/auth/resend-verification": {
      post: {
        tags: ["Authentication"],
        summary: "Resend an email verification code",
        description:
          "Uses a one-minute resend cooldown in addition to the 10-attempt authentication limit.",
        operationId: "resendVerification",
        requestBody: requestBody("EmailRequest"),
        responses: {
          "200": authJsonResponse("Request accepted without disclosing account existence", {
            $ref: "#/components/schemas/VerificationResentResponse",
          }),
          ...authCommonResponses,
          "429": jsonResponse(
            "Verification code was sent recently (one-minute service cooldown), or the authentication attempt rate limit was exceeded. Retry-After is present only when express-rate-limit rejects the request; the service cooldown does not set it.",
            { $ref: "#/components/schemas/ResendVerificationRateLimitErrorResponse" },
            authRateLimitedHeaders,
          ),
        },
      },
    },
    "/auth/forgot-password": {
      post: {
        tags: ["Authentication"],
        summary: "Request a password reset",
        description:
          "Returns the same response whether or not the account exists. This route is limited to 10 attempts per client IP and email per 15 minutes.",
        operationId: "forgotPassword",
        requestBody: requestBody("EmailRequest"),
        responses: {
          "204": { description: "Request accepted", headers: authRateLimitHeaders },
          ...authCommonResponses,
        },
      },
    },
    "/auth/reset-password": {
      post: {
        tags: ["Authentication"],
        summary: "Reset a password",
        description:
          "Consumes a single-use reset token and invalidates existing JWTs. This route is limited to 10 attempts per client IP per 15 minutes.",
        operationId: "resetPassword",
        requestBody: requestBody("ResetPasswordRequest"),
        responses: {
          "204": { description: "Password reset", headers: authRateLimitHeaders },
          ...authCommonResponses,
        },
      },
    },
    "/users/me": {
      get: {
        tags: ["Users"],
        summary: "Get the current profile",
        operationId: "getCurrentUser",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": jsonResponse("Current profile", {
            $ref: "#/components/schemas/UserProfile",
          }),
          "401": bearerUnauthorizedResponse,
          "404": errorResponse("User not found"),
          "500": internalErrorResponse,
        },
      },
      patch: {
        tags: ["Users"],
        summary: "Update the current profile",
        operationId: "updateCurrentUser",
        security: [{ bearerAuth: [] }],
        requestBody: requestBody("UpdateProfileRequest"),
        responses: {
          "200": jsonResponse("Updated profile", {
            $ref: "#/components/schemas/UserProfile",
          }),
          "400": validationErrorResponse,
          "401": bearerUnauthorizedResponse,
          "404": errorResponse("User not found"),
          "500": internalErrorResponse,
        },
      },
    },
    "/users/me/change-password": {
      post: {
        tags: ["Users"],
        summary: "Change the current password",
        description: "Invalidates all JWTs issued before the password change.",
        operationId: "changePassword",
        security: [{ bearerAuth: [] }],
        requestBody: requestBody("ChangePasswordRequest"),
        responses: {
          "204": { description: "Password changed" },
          "400": validationErrorResponse,
          "401": errorResponse("JWT is invalid or the current password is incorrect"),
          "404": errorResponse("User not found"),
          "500": internalErrorResponse,
        },
      },
    },
    "/api-keys": {
      post: {
        tags: ["API keys"],
        summary: "Create an API key",
        description: "The plaintext key is returned only once in this response.",
        operationId: "createApiKey",
        security: [{ bearerAuth: [] }],
        requestBody: requestBody("CreateApiKeyRequest"),
        responses: {
          "201": jsonResponse("API key created", {
            $ref: "#/components/schemas/CreatedApiKey",
          }),
          "400": validationErrorResponse,
          "401": bearerUnauthorizedResponse,
          "500": internalErrorResponse,
        },
      },
      get: {
        tags: ["API keys"],
        summary: "List active API keys",
        operationId: "listApiKeys",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": jsonResponse("Active API keys, newest first", {
            type: "array",
            items: { $ref: "#/components/schemas/ApiKeySummary" },
          }),
          "401": bearerUnauthorizedResponse,
          "500": internalErrorResponse,
        },
      },
    },
    "/api-keys/{id}": {
      delete: {
        tags: ["API keys"],
        summary: "Revoke an API key",
        operationId: "revokeApiKey",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ApiKeyId" }],
        responses: {
          "204": { description: "API key revoked" },
          "401": bearerUnauthorizedResponse,
          "404": errorResponse("API key not found for the current account"),
          "500": internalErrorResponse,
        },
      },
    },
    "/job-offers/parse": {
      post: {
        tags: ["Job offers"],
        summary: "Parse a job offer into structured fields",
        description:
          "Accepts the raw text of a job offer and returns its structured fields. Parsing is not implemented yet: the response is a fixed simulated job offer and the submitted text is ignored. Consumes one request from the owning user's daily quota; all API keys owned by a user share a quota of 100 successful requests per UTC day.",
        operationId: "parseJobOffer",
        security: [{ apiKeyAuth: [] }],
        requestBody: requestBody("ParseJobOfferRequest"),
        responses: {
          "200": jsonResponse(
            "Simulated structured job offer",
            { $ref: "#/components/schemas/JobOffer" },
            dailyRateLimitHeaders,
          ),
          "400": validationErrorResponse,
          "401": errorResponse("Missing, invalid, or revoked API key"),
          "429": jsonResponse(
            "Daily quota exceeded",
            { $ref: "#/components/schemas/ErrorResponse" },
            dailyRateLimitHeaders,
          ),
          "500": internalErrorResponse,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT returned by POST /auth/login.",
      },
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "Plaintext API key returned once by POST /api-keys.",
      },
    },
    parameters: {
      ApiKeyId: {
        name: "id",
        in: "path",
        required: true,
        description: "API key identifier",
        schema: { type: "string", format: "uuid" },
      },
    },
    headers: {
      RateLimitPolicy: {
        description: "Authentication rate-limit policy, currently 10 requests per 900 seconds.",
        schema: { type: "string", example: "10;w=900" },
      },
      RateLimitLimit: {
        description: "Maximum authentication attempts in the current window.",
        schema: { type: "integer", example: 10 },
      },
      RateLimitRemaining: {
        description: "Authentication attempts remaining in the current window.",
        schema: { type: "integer", minimum: 0, example: 9 },
      },
      RateLimitReset: {
        description: "Seconds until the authentication rate-limit window resets.",
        schema: { type: "integer", minimum: 0, example: 900 },
      },
      RetryAfter: {
        description:
          "Seconds until the 15-minute authentication fixed window resets. Emitted by express-rate-limit only on auth-limit 429 responses; it is 900 at the start of a newly observed window.",
        schema: { type: "integer", minimum: 0, example: 900 },
      },
      DailyRateLimit: {
        description: "Maximum API-key requests per user per UTC day.",
        schema: { type: "integer", example: 100 },
      },
      DailyRateLimitRemaining: {
        description: "API-key requests remaining in the current UTC day.",
        schema: { type: "integer", minimum: 0, example: 99 },
      },
      DailyRateLimitReset: {
        description: "Unix timestamp in seconds for the next UTC midnight.",
        schema: { type: "integer", format: "int64", example: 1786147200 },
      },
    },
    schemas: {
      ErrorCode: {
        type: "string",
        enum: [
          "VALIDATION_ERROR",
          "UNAUTHORIZED",
          "FORBIDDEN",
          "NOT_FOUND",
          "CONFLICT",
          "RATE_LIMIT_EXCEEDED",
          "EMAIL_NOT_VERIFIED",
          "TOKEN_VERSION_MISMATCH",
          "INTERNAL_ERROR",
        ],
      },
      ErrorDetail: {
        type: "object",
        additionalProperties: false,
        required: ["message", "code"],
        properties: {
          message: { type: "string" },
          code: { $ref: "#/components/schemas/ErrorCode" },
        },
      },
      ErrorResponse: {
        type: "object",
        additionalProperties: false,
        required: ["error"],
        properties: { error: { $ref: "#/components/schemas/ErrorDetail" } },
      },
      ValidationIssue: {
        type: "object",
        additionalProperties: false,
        required: ["path", "message"],
        properties: {
          path: {
            type: "array",
            items: { oneOf: [{ type: "string" }, { type: "integer" }] },
          },
          message: { type: "string" },
        },
      },
      ValidationErrorDetail: {
        type: "object",
        additionalProperties: false,
        required: ["message", "code", "issues"],
        properties: {
          message: { type: "string", const: "Validation error" },
          code: { type: "string", const: "VALIDATION_ERROR" },
          issues: {
            type: "array",
            items: { $ref: "#/components/schemas/ValidationIssue" },
          },
        },
      },
      ValidationErrorResponse: {
        type: "object",
        additionalProperties: false,
        required: ["error"],
        properties: { error: { $ref: "#/components/schemas/ValidationErrorDetail" } },
      },
      BadRequestErrorResponse: {
        oneOf: [
          { $ref: "#/components/schemas/ValidationErrorResponse" },
          { $ref: "#/components/schemas/ErrorResponse" },
        ],
      },
      ResendVerificationRateLimitErrorResponse: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["error"],
            properties: {
              error: {
                type: "object",
                additionalProperties: false,
                required: ["message", "code"],
                properties: {
                  message: { type: "string", const: "Please wait before resending" },
                  code: { type: "string", const: "RATE_LIMIT_EXCEEDED" },
                },
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["error"],
            properties: {
              error: {
                type: "object",
                additionalProperties: false,
                required: ["message", "code"],
                properties: {
                  message: {
                    type: "string",
                    const: "Too many attempts. Please try again after 15 minutes.",
                  },
                  code: { type: "string", const: "RATE_LIMIT_EXCEEDED" },
                },
              },
            },
          },
        ],
      },
      HealthResponse: {
        type: "object",
        additionalProperties: false,
        required: ["status"],
        properties: { status: { type: "string", const: "ok" } },
      },
      ReadyResponse: {
        type: "object",
        additionalProperties: false,
        required: ["status", "checks"],
        properties: {
          status: { type: "string", const: "ready" },
          checks: {
            type: "object",
            additionalProperties: false,
            required: ["database"],
            properties: { database: { type: "string", const: "ok" } },
          },
        },
      },
      NotReadyResponse: {
        type: "object",
        additionalProperties: false,
        required: ["status", "checks"],
        properties: {
          status: { type: "string", const: "not ready" },
          checks: {
            type: "object",
            additionalProperties: false,
            required: ["database"],
            properties: { database: { type: "string", const: "unavailable" } },
          },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", format: "password", minLength: 8 },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", format: "password", minLength: 8 },
        },
      },
      VerifyEmailRequest: {
        type: "object",
        required: ["email", "code"],
        properties: {
          email: { type: "string", format: "email" },
          code: { type: "string", minLength: 6, maxLength: 6, example: "123456" },
        },
      },
      EmailRequest: {
        type: "object",
        required: ["email"],
        properties: { email: { type: "string", format: "email" } },
      },
      ResetPasswordRequest: {
        type: "object",
        required: ["token", "password"],
        properties: {
          token: { type: "string", minLength: 1 },
          password: { type: "string", format: "password", minLength: 8 },
        },
      },
      RegisteredUser: {
        type: "object",
        additionalProperties: false,
        required: ["id", "email", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      LoginResponse: {
        type: "object",
        additionalProperties: false,
        required: ["token", "user"],
        properties: {
          token: { type: "string", description: "Signed JWT access token." },
          user: {
            type: "object",
            additionalProperties: false,
            required: ["id", "email", "emailVerifiedAt"],
            properties: {
              id: { type: "string", format: "uuid" },
              email: { type: "string", format: "email" },
              emailVerifiedAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
      EmailVerifiedResponse: {
        type: "object",
        additionalProperties: false,
        required: ["message"],
        properties: { message: { type: "string", const: "Email verified" } },
      },
      VerificationResentResponse: {
        type: "object",
        additionalProperties: false,
        required: ["message"],
        properties: {
          message: {
            type: "string",
            const: "If your email is registered, a new code has been sent",
          },
        },
      },
      UserProfile: {
        type: "object",
        additionalProperties: false,
        required: ["id", "email", "name", "emailVerifiedAt", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          name: { type: ["string", "null"] },
          emailVerifiedAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      UpdateProfileRequest: {
        type: "object",
        properties: { name: { type: "string", minLength: 1 } },
      },
      ChangePasswordRequest: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: { type: "string", format: "password", minLength: 1 },
          newPassword: { type: "string", format: "password", minLength: 8 },
        },
      },
      CreateApiKeyRequest: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string", minLength: 1 } },
      },
      CreatedApiKey: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "key", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          key: { type: "string", pattern: "^apk_", readOnly: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      ApiKeySummary: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "createdAt", "lastUsedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          lastUsedAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      ParseJobOfferRequest: {
        type: "object",
        required: ["text"],
        properties: { text: { type: "string", minLength: 1, maxLength: 20000 } },
      },
      JobOffer: {
        type: "object",
        additionalProperties: false,
        required: [
          "jobTitle",
          "company",
          "mainResponsibilities",
          "requiredTechnologies",
          "optionalTechnologies",
          "languages",
          "workMode",
          "salary",
          "benefits",
        ],
        properties: {
          jobTitle: { type: ["string", "null"] },
          company: { type: ["string", "null"] },
          mainResponsibilities: { type: "array", items: { type: "string" } },
          requiredTechnologies: { type: "array", items: { type: "string" } },
          optionalTechnologies: { type: "array", items: { type: "string" } },
          languages: { type: "array", items: { type: "string" } },
          workMode: { type: ["string", "null"] },
          salary: { type: ["string", "null"] },
          benefits: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};
