import type { JobOffer } from "../types/jobOffer.js";

/**
 * Fixed sample returned while the parser is not implemented yet. Replace the body of
 * `jobOfferService.parse` with the real extraction once it exists; the response contract
 * and the surrounding auth + quota behaviour stay the same.
 */
export const SIMULATED_JOB_OFFER: JobOffer = {
  jobTitle: "Senior Backend Engineer",
  company: "Acme Corp",
  mainResponsibilities: [
    "Design and maintain REST APIs",
    "Review pull requests and mentor mid-level engineers",
    "Own service reliability and observability",
  ],
  requiredTechnologies: ["Node.js", "TypeScript", "PostgreSQL"],
  optionalTechnologies: ["Docker", "Kubernetes", "Redis"],
  languages: ["English", "Spanish"],
  workMode: "Hybrid",
  salary: "USD 60,000 - 80,000 per year",
  benefits: ["Health insurance", "Annual training budget", "20 paid vacation days"],
};

export const jobOfferService = {
  async parse(_text: string): Promise<JobOffer> {
    return structuredClone(SIMULATED_JOB_OFFER);
  },
};
