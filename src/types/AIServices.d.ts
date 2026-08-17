import type { JobOffer } from "./jobOffer.js";

export interface IAService {
  name: string;
  extract: (offer: string) => Promise<JobOffer>;
}
