import type { ShapeTier } from "./types";

export type AccountSummary = {
  id: string;
  email: string;
  name: string | null;
  tier: ShapeTier;
  creditsRemaining: number;
  creditsIncluded: number;
  freeAutoPercent: number | null;
};
