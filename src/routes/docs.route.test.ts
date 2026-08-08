import { createConfig, lintFromString } from "@redocly/openapi-core";
import Ajv2020 from "ajv/dist/2020.js";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { APPLICATION_ROUTE_INVENTORY, createApp } from "../app.js";
import { getEnv } from "../config/env.js";

const app = createApp(getEnv());
const redoclyConfig = createConfig({ extends: ["spec"] });
const schemaValidator = new Ajv2020({ allErrors: true, strict: false });

const AUTH_HEADERS = [
  "RateLimit-Limit",
  "RateLimit-Policy",
  "RateLimit-Remaining",
  "RateLimit-Reset",
] as const;
const AUTH_LIMIT_HEADERS = [...AUTH_HEADERS, "Retry-After"] as const;
const DAILY_HEADERS = ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"] as const;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

interface ExpectedOperation {
  operationId: string;
  security: Array<Record<string, unknown[]>>;
  requestSchema: string | null;
  responseSchemas: Record<string, Record<string, unknown> | null>;
  responseHeaders: Record<string, readonly string[]>;
}

const OPERATION_MATRIX: Record<string, ExpectedOperation> = {
  "GET /health": {
    operationId: "getHealth",
    security: [],
    requestSchema: null,
    responseSchemas: { "200": ref("HealthResponse"), "500": ref("ErrorResponse") },
    responseHeaders: { "200": [], "500": [] },
  },
  "GET /health/ready": {
    operationId: "getReadiness",
    security: [],
    requestSchema: null,
    responseSchemas: { "200": ref("ReadyResponse"), "503": ref("NotReadyResponse") },
    responseHeaders: { "200": [], "503": [] },
  },
  "POST /auth/register": {
    operationId: "register",
    security: [],
    requestSchema: "RegisterRequest",
    responseSchemas: {
      "201": ref("RegisteredUser"),
      "400": ref("BadRequestErrorResponse"),
      "409": ref("ErrorResponse"),
      "429": ref("ErrorResponse"),
      "500": ref("ErrorResponse"),
    },
    responseHeaders: {
      "201": AUTH_HEADERS,
      "400": AUTH_HEADERS,
      "409": AUTH_HEADERS,
      "429": AUTH_LIMIT_HEADERS,
      "500": AUTH_HEADERS,
    },
  },
  "POST /auth/login": {
    operationId: "login",
    security: [],
    requestSchema: "LoginRequest",
    responseSchemas: {
      "200": ref("LoginResponse"),
      "400": ref("BadRequestErrorResponse"),
      "401": ref("ErrorResponse"),
      "403": ref("ErrorResponse"),
      "429": ref("ErrorResponse"),
      "500": ref("ErrorResponse"),
    },
    responseHeaders: {
      "200": AUTH_HEADERS,
      "400": AUTH_HEADERS,
      "401": AUTH_HEADERS,
      "403": AUTH_HEADERS,
      "429": AUTH_LIMIT_HEADERS,
      "500": AUTH_HEADERS,
    },
  },
  "POST /auth/verify-email": {
    operationId: "verifyEmail",
    security: [],
    requestSchema: "VerifyEmailRequest",
    responseSchemas: {
      "200": ref("EmailVerifiedResponse"),
      "400": ref("BadRequestErrorResponse"),
      "429": ref("ErrorResponse"),
      "500": ref("ErrorResponse"),
    },
    responseHeaders: {
      "200": AUTH_HEADERS,
      "400": AUTH_HEADERS,
      "429": AUTH_LIMIT_HEADERS,
      "500": AUTH_HEADERS,
    },
  },
  "POST /auth/resend-verification": {
    operationId: "resendVerification",
    security: [],
    requestSchema: "EmailRequest",
    responseSchemas: {
      "200": ref("VerificationResentResponse"),
      "400": ref("BadRequestErrorResponse"),
      "429": ref("ResendVerificationRateLimitErrorResponse"),
      "500": ref("ErrorResponse"),
    },
    responseHeaders: {
      "200": AUTH_HEADERS,
      "400": AUTH_HEADERS,
      "429": AUTH_LIMIT_HEADERS,
      "500": AUTH_HEADERS,
    },
  },
  "POST /auth/forgot-password": {
    operationId: "forgotPassword",
    security: [],
    requestSchema: "EmailRequest",
    responseSchemas: {
      "204": null,
      "400": ref("BadRequestErrorResponse"),
      "429": ref("ErrorResponse"),
      "500": ref("ErrorResponse"),
    },
    responseHeaders: {
      "204": AUTH_HEADERS,
      "400": AUTH_HEADERS,
      "429": AUTH_LIMIT_HEADERS,
      "500": AUTH_HEADERS,
    },
  },
  "POST /auth/reset-password": {
    operationId: "resetPassword",
    security: [],
    requestSchema: "ResetPasswordRequest",
    responseSchemas: {
      "204": null,
      "400": ref("BadRequestErrorResponse"),
      "429": ref("ErrorResponse"),
      "500": ref("ErrorResponse"),
    },
    responseHeaders: {
      "204": AUTH_HEADERS,
      "400": AUTH_HEADERS,
      "429": AUTH_LIMIT_HEADERS,
      "500": AUTH_HEADERS,
    },
  },
  "GET /users/me": {
    operationId: "getCurrentUser",
    security: [{ bearerAuth: [] }],
    requestSchema: null,
    responseSchemas: {
      "200": ref("UserProfile"),
      "401": ref("ErrorResponse"),
      "404": ref("ErrorResponse"),
      "500": ref("ErrorResponse"),
    },
    responseHeaders: { "200": [], "401": [], "404": [], "500": [] },
  },
  "PATCH /users/me": {
    operationId: "updateCurrentUser",
    security: [{ bearerAuth: [] }],
    requestSchema: "UpdateProfileRequest",
    responseSchemas: {
      "200": ref("UserProfile"),
      "400": ref("ValidationErrorResponse"),
      "401": ref("ErrorResponse"),
      "404": ref("ErrorResponse"),
      "500": ref("ErrorResponse"),
    },
    responseHeaders: { "200": [], "400": [], "401": [], "404": [], "500": [] },
  },
  "POST /users/me/change-password": {
    operationId: "changePassword",
    security: [{ bearerAuth: [] }],
    requestSchema: "ChangePasswordRequest",
    responseSchemas: {
      "204": null,
      "400": ref("ValidationErrorResponse"),
      "401": ref("ErrorResponse"),
      "404": ref("ErrorResponse"),
      "500": ref("ErrorResponse"),
    },
    responseHeaders: { "204": [], "400": [], "401": [], "404": [], "500": [] },
  },
  "POST /api-keys": {
    operationId: "createApiKey",
    security: [{ bearerAuth: [] }],
    requestSchema: "CreateApiKeyRequest",
    responseSchemas: {
      "201": ref("CreatedApiKey"),
      "400": ref("ValidationErrorResponse"),
      "401": ref("ErrorResponse"),
      "500": ref("ErrorResponse"),
    },
    responseHeaders: { "201": [], "400": [], "401": [], "500": [] },
  },
  "GET /api-keys": {
    operationId: "listApiKeys",
    security: [{ bearerAuth: [] }],
    requestSchema: null,
    responseSchemas: {
      "200": { type: "array", items: ref("ApiKeySummary") },
      "401": ref("ErrorResponse"),
      "500": ref("ErrorResponse"),
    },
    responseHeaders: { "200": [], "401": [], "500": [] },
  },
  "DELETE /api-keys/{id}": {
    operationId: "revokeApiKey",
    security: [{ bearerAuth: [] }],
    requestSchema: null,
    responseSchemas: {
      "204": null,
      "401": ref("ErrorResponse"),
      "404": ref("ErrorResponse"),
      "500": ref("ErrorResponse"),
    },
    responseHeaders: { "204": [], "401": [], "404": [], "500": [] },
  },
  "GET /protected": {
    operationId: "getProtectedResource",
    security: [{ apiKeyAuth: [] }],
    requestSchema: null,
    responseSchemas: {
      "200": ref("HealthResponse"),
      "401": ref("ErrorResponse"),
      "429": ref("ErrorResponse"),
      "500": ref("ErrorResponse"),
    },
    responseHeaders: { "200": DAILY_HEADERS, "401": [], "429": DAILY_HEADERS, "500": [] },
  },
};

const REQUEST_SCHEMAS = {
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
} as const;

interface OpenApiResponse {
  headers?: Record<string, unknown>;
  content?: Record<string, { schema?: Record<string, unknown> }>;
}

interface OpenApiOperation {
  operationId: string;
  requestBody?: {
    required: boolean;
    content: Record<string, { schema: { $ref: string } }>;
  };
  responses: Record<string, OpenApiResponse>;
  security?: Array<Record<string, unknown[]>>;
  parameters?: Array<{ $ref: string }>;
}

interface OpenApiContract {
  openapi: string;
  info: Record<string, unknown>;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: {
    securitySchemes: Record<string, unknown>;
    parameters: Record<string, unknown>;
    headers: Record<string, unknown>;
    schemas: Record<string, Record<string, unknown>>;
  };
}

function cloneContract(contract: OpenApiContract): OpenApiContract {
  return structuredClone(contract);
}

function collectEmbeddedSchemas(
  contract: OpenApiContract,
): Array<[string, Record<string, unknown>]> {
  const schemas: Array<[string, Record<string, unknown>]> = [];
  const seen = new WeakSet<object>();

  const visit = (value: unknown, pointer: string): void => {
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${pointer}/${index}`));
      return;
    }

    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      const childPointer = `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
      if (key === "schema" && child !== null && typeof child === "object") {
        schemas.push([childPointer, child as Record<string, unknown>]);
      }
      visit(child, childPointer);
    }
  };

  for (const [name, schema] of Object.entries(contract.components.schemas)) {
    schemas.push([`#/components/schemas/${name}`, schema]);
  }
  visit(contract, "#");
  return schemas;
}

function embeddedSchemaErrors(contract: OpenApiContract): string[] {
  return collectEmbeddedSchemas(contract).flatMap(([pointer, schema]) => {
    if (schemaValidator.validateSchema(schema)) return [];
    return [`${pointer}: ${schemaValidator.errorsText(schemaValidator.errors)}`];
  });
}

async function documentErrors(contract: OpenApiContract): Promise<string[]> {
  const problems = await lintFromString({
    source: JSON.stringify(contract),
    absoluteRef: "openapi.json",
    config: await redoclyConfig,
  });
  return problems
    .filter((problem) => problem.severity === "error")
    .map((problem) => `${problem.ruleId}: ${problem.message}`);
}

function operationEntries(contract: OpenApiContract): Array<[string, OpenApiOperation]> {
  return Object.entries(contract.paths).flatMap(([path, pathItem]) =>
    Object.entries(pathItem).map(([method, operation]) => [
      `${method.toUpperCase()} ${path}`,
      operation,
    ]),
  );
}

async function probeOperation(method: string, path: string): Promise<number> {
  const runtimePath = path.replace("{id}", "00000000-0000-4000-8000-000000000000");
  switch (method) {
    case "GET":
      return (await request(app).get(runtimePath)).status;
    case "POST":
      return (await request(app).post(runtimePath).send({})).status;
    case "PATCH":
      return (await request(app).patch(runtimePath).send({})).status;
    case "DELETE":
      return (await request(app).delete(runtimePath)).status;
    default:
      throw new Error(`Unsupported documented method: ${method}`);
  }
}

describe("API documentation", () => {
  it("serves an OpenAPI 3.1 document valid at both document and Schema Object layers", async () => {
    const response = await request(app).get("/openapi.json").expect(200);
    const contract = response.body as OpenApiContract;

    expect(response.headers["content-type"]).toMatch(/^application\/json/);
    expect(contract.openapi).toBe("3.1.0");
    expect(await documentErrors(contract)).toEqual([]);
    expect(embeddedSchemaErrors(contract)).toEqual([]);
  });

  it("rejects invalid document structure and invalid nested or inline Schema Objects", async () => {
    const contract = (await request(app).get("/openapi.json").expect(200)).body as OpenApiContract;
    const invalidDocument = cloneContract(contract);
    invalidDocument.info.title = 42;

    const invalidNestedSchema = cloneContract(contract);
    const registeredUser = invalidNestedSchema.components.schemas.RegisteredUser;
    const properties = registeredUser.properties as Record<string, Record<string, unknown>>;
    properties.id.type = "uuid";

    const invalidInlineSchema = cloneContract(contract);
    const listSchema =
      invalidInlineSchema.paths["/api-keys"].get.responses["200"].content?.["application/json"]
        .schema;
    if (listSchema === undefined) throw new Error("List API keys response schema is missing");
    listSchema.items = "ApiKeySummary";

    expect(await documentErrors(invalidDocument)).not.toEqual([]);
    expect(embeddedSchemaErrors(invalidNestedSchema)).not.toEqual([]);
    expect(embeddedSchemaErrors(invalidInlineSchema)).not.toEqual([]);
  });

  it("matches the exact operation response, security, request, error, and header matrix", async () => {
    const contract = (await request(app).get("/openapi.json").expect(200)).body as OpenApiContract;
    const actualEntries = operationEntries(contract);

    expect(Object.keys(contract.paths)).toHaveLength(13);
    expect(actualEntries.map(([key]) => key).sort()).toEqual(Object.keys(OPERATION_MATRIX).sort());

    for (const [key, operation] of actualEntries) {
      const expected = OPERATION_MATRIX[key];
      const requestSchema =
        operation.requestBody?.content["application/json"].schema.$ref.split("/").at(-1) ?? null;
      const responseSchemas = Object.fromEntries(
        Object.entries(operation.responses).map(([status, response]) => [
          status,
          response.content?.["application/json"].schema ?? null,
        ]),
      );
      const responseHeaders = Object.fromEntries(
        Object.entries(operation.responses).map(([status, response]) => [
          status,
          Object.keys(response.headers ?? {}).sort(),
        ]),
      );

      expect(operation.operationId, key).toBe(expected.operationId);
      expect(operation.security ?? [], key).toEqual(expected.security);
      expect(requestSchema, key).toBe(expected.requestSchema);
      expect(responseSchemas, key).toEqual(expected.responseSchemas);
      expect(responseHeaders, key).toEqual(
        Object.fromEntries(
          Object.entries(expected.responseHeaders).map(([status, headers]) => [
            status,
            [...headers].sort(),
          ]),
        ),
      );
    }
  });

  it("documents exact critical request constraints and the path parameter", async () => {
    const contract = (await request(app).get("/openapi.json").expect(200)).body as OpenApiContract;

    expect(
      Object.fromEntries(
        Object.keys(REQUEST_SCHEMAS).map((name) => [name, contract.components.schemas[name]]),
      ),
    ).toEqual(REQUEST_SCHEMAS);
    expect(contract.paths["/api-keys/{id}"].delete.parameters).toEqual([
      { $ref: "#/components/parameters/ApiKeyId" },
    ]);
    expect(contract.components.parameters.ApiKeyId).toEqual({
      name: "id",
      in: "path",
      required: true,
      description: "API key identifier",
      schema: { type: "string", format: "uuid" },
    });
  });

  it("distinguishes auth-limit Retry-After from the resend service cooldown", async () => {
    const contract = (await request(app).get("/openapi.json").expect(200)).body as OpenApiContract;
    const retryAfter = contract.components.headers.RetryAfter as Record<string, unknown>;
    const resend429 = contract.paths["/auth/resend-verification"].post.responses["429"];

    expect(retryAfter).toEqual({
      description:
        "Seconds until the 15-minute authentication fixed window resets. Emitted by express-rate-limit only on auth-limit 429 responses; it is 900 at the start of a newly observed window.",
      schema: { type: "integer", minimum: 0, example: 900 },
    });
    expect(resend429.description).toContain(
      "Retry-After is present only when express-rate-limit rejects the request",
    );
    expect(resend429.description).toContain("service cooldown does not set it");
    expect(resend429.headers).toHaveProperty("Retry-After", {
      $ref: "#/components/headers/RetryAfter",
    });
  });

  it("matches the complete registered application inventory and every operation is non-404", async () => {
    const contract = (await request(app).get("/openapi.json").expect(200)).body as OpenApiContract;
    const documentedInventory = operationEntries(contract)
      .map(([key]) => key.replace("{id}", ":id"))
      .sort();
    const registeredInventory = APPLICATION_ROUTE_INVENTORY.map(
      ([method, path]) => `${method} ${path}`,
    ).sort();

    expect(documentedInventory).toEqual(registeredInventory);
    for (const key of Object.keys(OPERATION_MATRIX)) {
      const separator = key.indexOf(" ");
      const method = key.slice(0, separator);
      const path = key.slice(separator + 1);
      expect(await probeOperation(method, path), key).not.toBe(404);
    }
  });

  it("serves Scalar API Reference with a pinned CDN script and matching CSP nonces", async () => {
    const page = await request(app).get("/docs").expect(200);
    expect(page.headers["content-type"]).toMatch(/^text\/html/);
    expect(page.text).toContain("<title>Scalar API Reference</title>");
    expect(page.text).toContain('<div id="app"></div>');
    expect(page.text).toContain('src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.64.1"');

    const csp = page.headers["content-security-policy"];
    expect(csp).toContain("script-src 'self' https://cdn.jsdelivr.net");
    const cspNonce = csp.match(/'nonce-([^']+)'/)?.[1];
    expect(cspNonce).toBeTruthy();
    const scriptNonces = [...page.text.matchAll(/<script\b([^>]*)>/g)].map(
      ([, attributes]) => attributes.match(/\bnonce="([^"]+)"/)?.[1],
    );
    expect(scriptNonces.length).toBeGreaterThan(0);
    expect(scriptNonces.every((nonce) => nonce === cspNonce)).toBe(true);
    expect(page.text).toContain(`<meta property="csp-nonce" content="${cspNonce}" />`);
    const styleNonces = [...page.text.matchAll(/<style\b([^>]*)>/g)].map(
      ([, attributes]) => attributes.match(/\bnonce="([^"]+)"/)?.[1],
    );
    expect(styleNonces.every((nonce) => nonce === cspNonce)).toBe(true);
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("script-src 'unsafe-inline'");
  });

  it("serves Scalar HTML only on the exact documentation GET paths", async () => {
    for (const path of ["/docs", "/docs/"]) {
      await request(app).get(path).expect(200);
    }

    for (const path of ["/docs/unknown", "/docs/unknown/nested"]) {
      const response = await request(app).get(path).expect(404);
      expect(response.text).not.toContain("<title>Scalar API Reference</title>");
    }

    for (const method of ["post", "put", "patch", "delete"] as const) {
      const response = await request(app)[method]("/docs").expect(404);
      expect(response.text).not.toContain("<title>Scalar API Reference</title>");
    }
  });

  it("configures Scalar to fetch the OpenAPI contract externally", async () => {
    const page = await request(app).get("/docs").expect(200);

    expect(page.text).toContain('"url": "/openapi.json"');
  });

  it("keeps documentation public while protected routes still require credentials", async () => {
    await request(app).get("/openapi.json").expect(200);
    await request(app).get("/users/me").expect(401);
    await request(app).get("/protected").expect(401);
  });
});
