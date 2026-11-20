import type { Company } from "@/lib/types";

export function hasActiveSubscription(
  company: Pick<Company, "subscription_status" | "trial_ends_at" | "internal_owner_access">,
  now = Date.now(),
) {
  return (
    company.internal_owner_access === true ||
    company.subscription_status === "active" ||
    (company.subscription_status === "trial" && new Date(company.trial_ends_at).getTime() > now)
  );
}

export function trialDaysRemaining(trialEndsAt: string) {
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000));
}
