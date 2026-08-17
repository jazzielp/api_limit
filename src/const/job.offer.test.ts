import { describe, it, expect } from "vitest";
import {
  JOB_OFFER_JSON_SCHEMA,
  JOB_OFFER_SYSTEM_PROMPT,
  parseJobOfferResponse,
} from "./job.offer.js";
import type { JobOffer } from "../types/jobOffer.js";

const VALID_OFFER: JobOffer = {
  jobTitle: "Senior Backend Engineer",
  company: "Acme Corp",
  mainResponsibilities: ["Design and maintain REST APIs"],
  requiredTechnologies: ["Node.js", "TypeScript"],
  optionalTechnologies: ["Docker"],
  languages: ["English"],
  workMode: "Hybrid",
  salary: "USD 60,000 - 80,000 per year",
  benefits: ["Health insurance"],
};

const EMPTY_OFFER: JobOffer = {
  jobTitle: null,
  company: null,
  mainResponsibilities: [],
  requiredTechnologies: [],
  optionalTechnologies: [],
  languages: [],
  workMode: null,
  salary: null,
  benefits: [],
};

const NULLABLE_FIELDS = ["jobTitle", "company", "workMode", "salary"] as const;
const ARRAY_FIELDS = [
  "mainResponsibilities",
  "requiredTechnologies",
  "optionalTechnologies",
  "languages",
  "benefits",
] as const;

describe("JOB_OFFER_JSON_SCHEMA", () => {
  it("requires every field of the JobOffer contract and forbids extras", () => {
    expect(JOB_OFFER_JSON_SCHEMA.required).toEqual(Object.keys(EMPTY_OFFER));
    expect(Object.keys(JOB_OFFER_JSON_SCHEMA.properties)).toEqual(Object.keys(EMPTY_OFFER));
    expect(JOB_OFFER_JSON_SCHEMA.additionalProperties).toBe(false);
  });

  it("declares nullable strings and string arrays consistently with the TypeScript type", () => {
    const properties = JOB_OFFER_JSON_SCHEMA.properties as Record<string, Record<string, unknown>>;

    for (const field of NULLABLE_FIELDS) {
      expect(properties[field].type, field).toEqual(["string", "null"]);
    }
    for (const field of ARRAY_FIELDS) {
      expect(properties[field].type, field).toBe("array");
      expect(properties[field].items, field).toEqual({ type: "string" });
    }
  });

  it("instructs the model not to invent data and to preserve the source language", () => {
    expect(JOB_OFFER_SYSTEM_PROMPT).toContain("without inventing information");
    expect(JOB_OFFER_SYSTEM_PROMPT).toContain("Preserve the source language");
  });
});

describe("parseJobOfferResponse", () => {
  it("parses a fully populated job offer", () => {
    expect(parseJobOfferResponse(JSON.stringify(VALID_OFFER), "OpenAI")).toEqual(VALID_OFFER);
  });

  it("parses an offer where every optional value is null or empty", () => {
    expect(parseJobOfferResponse(JSON.stringify(EMPTY_OFFER), "OpenAI")).toEqual(EMPTY_OFFER);
  });

  it("strips unknown fields the model may add", () => {
    const withExtras = { ...VALID_OFFER, confidence: 0.9, rawText: "ignored" };

    const parsed = parseJobOfferResponse(JSON.stringify(withExtras), "OpenAI");

    expect(parsed).toEqual(VALID_OFFER);
    expect(parsed).not.toHaveProperty("confidence");
    expect(parsed).not.toHaveProperty("rawText");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty string", ""],
    ["a non-string value", { jobTitle: "already an object" }],
    ["a number", 42],
  ])("throws a provider-tagged empty-response error for %s", (_case, content) => {
    expect(() => parseJobOfferResponse(content, "OpenAI")).toThrow(
      "OpenAI returned an empty job offer response",
    );
  });

  it("names the failing provider in the error message", () => {
    expect(() => parseJobOfferResponse("", "Anthropic")).toThrow(
      "Anthropic returned an empty job offer response",
    );
  });

  it.each(NULLABLE_FIELDS)("rejects a response where %s is not a string or null", (field) => {
    const invalid = { ...VALID_OFFER, [field]: 123 };

    expect(() => parseJobOfferResponse(JSON.stringify(invalid), "OpenAI")).toThrow(
      "OpenAI returned an invalid job offer response",
    );
  });

  it.each(ARRAY_FIELDS)("rejects a response where %s is not a string array", (field) => {
    const notAnArray = { ...VALID_OFFER, [field]: "Node.js" };
    const wrongItems = { ...VALID_OFFER, [field]: ["Node.js", 42] };

    expect(() => parseJobOfferResponse(JSON.stringify(notAnArray), "OpenAI")).toThrow(
      "OpenAI returned an invalid job offer response",
    );
    expect(() => parseJobOfferResponse(JSON.stringify(wrongItems), "OpenAI")).toThrow(
      "OpenAI returned an invalid job offer response",
    );
  });

  it.each(Object.keys(EMPTY_OFFER))("rejects a response missing the %s field", (field) => {
    const incomplete: Record<string, unknown> = { ...VALID_OFFER };
    delete incomplete[field];

    expect(() => parseJobOfferResponse(JSON.stringify(incomplete), "OpenAI")).toThrow(
      "OpenAI returned an invalid job offer response",
    );
  });

  it.each([
    ["a JSON array", "[]"],
    ["a JSON null", "null"],
    ["a JSON string", '"just text"'],
    ["a JSON number", "7"],
  ])("rejects %s that is valid JSON but not a job offer", (_case, content) => {
    expect(() => parseJobOfferResponse(content, "OpenAI")).toThrow(
      "OpenAI returned an invalid job offer response",
    );
  });

  it("propagates the SyntaxError when the model returns malformed JSON", () => {
    expect(() => parseJobOfferResponse("{ not json", "OpenAI")).toThrow(SyntaxError);
  });
});
