import OpenAI from "openai";
import { getEnv } from "../../config/env.js";
import type { JobOffer } from "../../types/jobOffer.js";
import {
  JOB_OFFER_JSON_SCHEMA,
  JOB_OFFER_SYSTEM_PROMPT,
  parseJobOfferResponse,
} from "../../const/job.offer.js";

export async function extractJobOfferWithOpenAI(
  offer: string,
): Promise<JobOffer> {
  const env = getEnv();
  const openai = new OpenAI({ apiKey: env.OEPNIA_API_KEY });

  const response = await openai.responses.create({
    model: env.OPENIA_MODEL,
    instructions: JOB_OFFER_SYSTEM_PROMPT,
    input: offer,
    reasoning: { effort: "minimal" },
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "job_offer",
        strict: true,
        schema: JOB_OFFER_JSON_SCHEMA,
      },
    },
  });

  return parseJobOfferResponse(response.output_text, "OpenAI");
}
