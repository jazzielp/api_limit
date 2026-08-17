import { describe, it, expect, vi, beforeEach } from "vitest";
import { getEnv } from "../../config/env.js";
import { JOB_OFFER_JSON_SCHEMA, JOB_OFFER_SYSTEM_PROMPT } from "../../const/job.offer.js";
import type { JobOffer } from "../../types/jobOffer.js";

const { createMock, openAiConstructor } = vi.hoisted(() => {
  const createMock = vi.fn();
  const openAiConstructor = vi.fn(() => ({ responses: { create: createMock } }));
  return { createMock, openAiConstructor };
});

vi.mock("openai", () => ({ default: openAiConstructor }));

const { openaiService } = await import("./openia.js");

const OFFER_TEXT = "Senior Backend Engineer at Acme Corp. Node.js and TypeScript.";

const EXPECTED_OFFER: JobOffer = {
  jobTitle: "Senior Backend Engineer",
  company: "Acme Corp",
  mainResponsibilities: ["Design and maintain REST APIs"],
  requiredTechnologies: ["Node.js", "TypeScript"],
  optionalTechnologies: [],
  languages: ["English"],
  workMode: "Hybrid",
  salary: null,
  benefits: [],
};

describe("openaiService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue({ output_text: JSON.stringify(EXPECTED_OFFER) });
  });

  it("identifies itself as the OpenAI provider", () => {
    expect(openaiService.name).toBe("OpenAI");
  });

  it("returns the job offer parsed from the model output", async () => {
    expect(await openaiService.extract(OFFER_TEXT)).toEqual(EXPECTED_OFFER);
  });

  it("builds the client with the configured API key", async () => {
    await openaiService.extract(OFFER_TEXT);

    expect(openAiConstructor).toHaveBeenCalledWith({ apiKey: getEnv().OEPNIA_API_KEY });
  });

  it("sends the configured model, the system prompt, and the offer text", async () => {
    await openaiService.extract(OFFER_TEXT);

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toMatchObject({
      model: getEnv().OPENIA_MODEL,
      instructions: JOB_OFFER_SYSTEM_PROMPT,
      input: OFFER_TEXT,
    });
  });

  it("requests a strict structured response matching the job offer schema", async () => {
    await openaiService.extract(OFFER_TEXT);

    expect(createMock.mock.calls[0][0].text.format).toEqual({
      type: "json_schema",
      name: "job_offer",
      strict: true,
      schema: JOB_OFFER_JSON_SCHEMA,
    });
  });

  it("rejects a response whose payload does not match the job offer contract", async () => {
    createMock.mockResolvedValue({ output_text: JSON.stringify({ jobTitle: "Only a title" }) });

    await expect(openaiService.extract(OFFER_TEXT)).rejects.toThrow(
      "OpenAI returned an invalid job offer response",
    );
  });

  it("rejects an empty model output", async () => {
    createMock.mockResolvedValue({ output_text: "" });

    await expect(openaiService.extract(OFFER_TEXT)).rejects.toThrow(
      "OpenAI returned an empty job offer response",
    );
  });

  it("propagates transport failures from the OpenAI client", async () => {
    createMock.mockRejectedValue(new Error("Connection error"));

    await expect(openaiService.extract(OFFER_TEXT)).rejects.toThrow("Connection error");
  });
});
