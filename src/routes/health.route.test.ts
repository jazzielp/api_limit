import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { getEnv } from "../config/env.js";
import { getPrisma } from "../db/prisma.js";

vi.mock("../db/prisma.js", () => ({
  getPrisma: vi.fn(),
  closePrisma: vi.fn(),
}));

const app = createApp(getEnv());

describe("GET /health", () => {
  it("returns an ok status", async () => {
    const response = await request(app).get("/health").expect(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});

describe("GET /health/ready", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ready when the database is reachable", async () => {
    vi.mocked(getPrisma).mockReturnValue({
      $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
    } as unknown as ReturnType<typeof getPrisma>);

    const response = await request(app).get("/health/ready").expect(200);
    expect(response.body).toEqual({
      status: "ready",
      checks: { database: "ok" },
    });
  });

  it("returns 503 when the database is unreachable", async () => {
    vi.mocked(getPrisma).mockReturnValue({
      $queryRaw: vi.fn().mockRejectedValue(new Error("connection refused")),
    } as unknown as ReturnType<typeof getPrisma>);

    const response = await request(app).get("/health/ready").expect(503);
    expect(response.body).toEqual({
      status: "not ready",
      checks: { database: "unavailable" },
    });
  });
});
