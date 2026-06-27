/**
 * Expert profile tracking — computes a trust weight for each contributor
 * based on their historical contribution quality.
 *
 * trustWeight ranges from 0.2 (new user) to 0.95 (highly trusted),
 * and gets multiplied into the confidence of memories they create.
 */
import { db } from "@/lib/db";

const NEW_USER_WEIGHT = 0.5;
const MIN_WEIGHT = 0.2;
const MAX_WEIGHT = 0.95;

export async function getOrCreateExpertProfile(userId: string) {
  return db.expertProfile.upsert({
    where: { userId },
    update: { lastActiveAt: new Date() },
    create: { userId, trustWeight: NEW_USER_WEIGHT, lastActiveAt: new Date() },
  });
}

export async function recordContribution(userId: string): Promise<void> {
  await db.expertProfile.upsert({
    where: { userId },
    update: { contributionsCount: { increment: 1 }, lastActiveAt: new Date() },
    create: { userId, contributionsCount: 1, lastActiveAt: new Date() },
  });
}

export async function recordReviewOutcome(userId: string, accepted: boolean): Promise<number> {
  const profile = await getOrCreateExpertProfile(userId);
  const newAccepted = profile.acceptedCount + (accepted ? 1 : 0);
  const newRejected = profile.rejectedCount + (accepted ? 0 : 1);
  const total = newAccepted + newRejected;
  // Bayesian-ish smoothing — prior of 5 trials at 0.5
  const smoothed = (newAccepted + 5 * 0.5) / (total + 5);
  const newWeight = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, smoothed));
  await db.expertProfile.update({
    where: { userId },
    data: {
      acceptedCount: newAccepted,
      rejectedCount: newRejected,
      trustWeight: newWeight,
    },
  });
  return newWeight;
}

export async function getTrustWeight(userId: string): Promise<number> {
  const p = await db.expertProfile.findUnique({ where: { userId } });
  return p?.trustWeight ?? NEW_USER_WEIGHT;
}
