import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConfigurationError } from "./config/env.js";

describe("server startup", () => {
  const consoleError = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("console", {
      error: consoleError,
      info: vi.fn(),
    });
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit:${code}`);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exits when the environment configuration is invalid", async () => {
    vi.doMock("./config/env.js", () => ({
      loadEnv: vi.fn(() => {
        throw new ConfigurationError("Invalid environment configuration", []);
      }),
    }));

    await expect(import("./server.js")).rejects.toThrow("process.exit:1");
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to start server:",
      expect.any(ConfigurationError),
    );
  });
});
