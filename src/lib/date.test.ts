import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getCurrentUtcDate,
  getCurrentUtcDateString,
  getNextUtcMidnight,
  addMinutes,
} from "./date.js";

describe("date helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("getCurrentUtcDate returns midnight UTC for the current day", () => {
    vi.setSystemTime(new Date("2026-08-06T23:59:59Z"));

    const result = getCurrentUtcDate();

    expect(result.toISOString()).toBe("2026-08-06T00:00:00.000Z");
  });

  it("getCurrentUtcDateString returns YYYY-MM-DD in UTC", () => {
    vi.setSystemTime(new Date("2026-08-06T23:59:59Z"));

    expect(getCurrentUtcDateString()).toBe("2026-08-06");
  });

  it("getNextUtcMidnight returns the next UTC midnight", () => {
    vi.setSystemTime(new Date("2026-08-06T12:00:00Z"));

    const result = getNextUtcMidnight();

    expect(result.toISOString()).toBe("2026-08-07T00:00:00.000Z");
  });

  it("addMinutes adds minutes to a date", () => {
    const base = new Date("2026-08-06T12:00:00Z");

    const result = addMinutes(base, 15);

    expect(result.toISOString()).toBe("2026-08-06T12:15:00.000Z");
  });
});
