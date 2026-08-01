export type ShapeTier = "free" | "plus" | "pro" | "max" | "team";

export type ShapeAuthState = {
  loggedIn: boolean;
  isLoggingIn: boolean;
  isLoading: boolean;
  /** True when showing cached profile but the server could not be reached. */
  offline?: boolean;
  /** True while revalidating cached profile against the server. */
  revalidating?: boolean;
  error: string | null;
  userId: string | null;
  email: string | null;
  name: string | null;
  tier: ShapeTier;
  creditsRemaining: number;
  creditsIncluded: number;
  freeAutoPercent: number | null;
  accessToken: string | null;
};

export type UsageCheckResult = {
  allowed: boolean;
  reason?: string;
  creditsRemaining: number;
  tier: ShapeTier;
  onDemand?: boolean;
};

export type TokenExchangeResponse = {
  accessToken: string;
  user: { id: string; email: string; name: string | null };
  tier: ShapeTier;
  credits: number;
};
