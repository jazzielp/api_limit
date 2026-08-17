import { describe, it, expect } from "vitest";
import { nextService } from "./jobOffer.controller.js";
import { openaiService } from "../services/IA/openia.js";

describe("nextService", () => {
  it("returns a provider that satisfies the IAService contract", () => {
    const service = nextService();

    expect(typeof service.name).toBe("string");
    expect(service.name.length).toBeGreaterThan(0);
    expect(typeof service.extract).toBe("function");
  });

  it("never returns undefined, so the index always stays inside the registry", () => {
    const rounds = Array.from({ length: 10 }, () => nextService());

    expect(rounds.every((service) => service !== undefined)).toBe(true);
  });

  it("cycles through the registry and comes back to the first provider", () => {
    const first = nextService();
    const seen = new Set([first.name]);

    let current = nextService();
    while (current !== first && seen.size < 100) {
      seen.add(current.name);
      current = nextService();
    }

    expect(current).toBe(first);
  });

  it("currently resolves to the only registered provider, OpenAI", () => {
    expect(nextService()).toBe(openaiService);
  });
});
