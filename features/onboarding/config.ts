export const ONBOARDING_CONFIG = {
  enabled: true,
  storageKey: "shape-onboarding-complete",
};

export function isOnboardingComplete(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ONBOARDING_CONFIG.storageKey) === "1";
}

export function markOnboardingComplete() {
  if (typeof window === "undefined") return;
  localStorage.setItem(ONBOARDING_CONFIG.storageKey, "1");
}