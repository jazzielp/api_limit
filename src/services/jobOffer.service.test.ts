import { describe, it, expect } from "vitest";
import { jobOfferService, SIMULATED_JOB_OFFER } from "./jobOffer.service.js";

describe("jobOfferService.parse", () => {
  it("returns the simulated job offer regardless of the submitted text", async () => {
    const first = await jobOfferService.parse("Senior Backend Engineer at Acme");
    const second = await jobOfferService.parse("Completely different offer text");

    expect(first).toEqual(SIMULATED_JOB_OFFER);
    expect(second).toEqual(SIMULATED_JOB_OFFER);
  });

  it("returns every field of the job offer contract", async () => {
    const offer = await jobOfferService.parse("any text");

    expect(Object.keys(offer).sort()).toEqual(
      [
        "benefits",
        "company",
        "jobTitle",
        "languages",
        "mainResponsibilities",
        "optionalTechnologies",
        "requiredTechnologies",
        "salary",
        "workMode",
      ].sort(),
    );
  });

  it("returns a fresh copy so callers cannot mutate the simulated source", async () => {
    const offer = await jobOfferService.parse("any text");
    offer.requiredTechnologies.push("mutated");
    offer.jobTitle = "mutated";

    expect(await jobOfferService.parse("any text")).toEqual(SIMULATED_JOB_OFFER);
    expect(SIMULATED_JOB_OFFER.requiredTechnologies).not.toContain("mutated");
  });
});
