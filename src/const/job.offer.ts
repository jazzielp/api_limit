import type { JobOffer } from "../types/jobOffer.js";

export const JOB_OFFER_SYSTEM_PROMPT =
  "Extract job offer data without inventing information. Preserve the source language. Use null or an empty array when a value is not present.";

export const JOB_OFFER_JSON_SCHEMA = {
  type: "object",
  properties: {
    jobTitle: { type: ["string", "null"] },
    company: { type: ["string", "null"] },
    mainResponsibilities: {
      type: "array",
      items: { type: "string" },
    },
    requiredTechnologies: {
      type: "array",
      items: { type: "string" },
    },
    optionalTechnologies: {
      type: "array",
      items: { type: "string" },
    },
    languages: {
      type: "array",
      items: { type: "string" },
    },
    workMode: { type: ["string", "null"] },
    salary: { type: ["string", "null"] },
    benefits: {
      type: "array",
      items: { type: "string" },
    },
  },
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
  additionalProperties: false,
};
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isJobOffer(value: unknown): value is JobOffer {
  return (
    typeof value === "object" &&
    value !== null &&
    "jobTitle" in value &&
    isNullableString(value.jobTitle) &&
    "company" in value &&
    isNullableString(value.company) &&
    "mainResponsibilities" in value &&
    isStringArray(value.mainResponsibilities) &&
    "requiredTechnologies" in value &&
    isStringArray(value.requiredTechnologies) &&
    "optionalTechnologies" in value &&
    isStringArray(value.optionalTechnologies) &&
    "languages" in value &&
    isStringArray(value.languages) &&
    "workMode" in value &&
    isNullableString(value.workMode) &&
    "salary" in value &&
    isNullableString(value.salary) &&
    "benefits" in value &&
    isStringArray(value.benefits)
  );
}

export function parseJobOfferResponse(
  content: unknown,
  provider: string,
): JobOffer {
  if (typeof content !== "string" || content.length === 0) {
    throw new Error(`${provider} returned an empty job offer response`);
  }

  const parsed: unknown = JSON.parse(content);

  if (!isJobOffer(parsed)) {
    throw new Error(`${provider} returned an invalid job offer response`);
  }

  return {
    jobTitle: parsed.jobTitle,
    company: parsed.company,
    mainResponsibilities: parsed.mainResponsibilities,
    requiredTechnologies: parsed.requiredTechnologies,
    optionalTechnologies: parsed.optionalTechnologies,
    languages: parsed.languages,
    workMode: parsed.workMode,
    salary: parsed.salary,
    benefits: parsed.benefits,
  };
}
