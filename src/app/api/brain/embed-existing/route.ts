/**
 * POST /api/brain/embed-existing
 *
 * One-shot admin endpoint that backfills vector embeddings for all BrainMemory
 * rows that were created before the vector upgrade (embedding IS NULL).
 *
 * Protected by CRON_SECRET (same header used by the autonomy pipeline).
 * Rate-limited internally: processes rows in batches with a small delay to
 * stay within Gemini free-tier rate limits (~1500 req/day, 60 req/min).
 *
 * Usage:
 *   curl -s -X POST https://localhost:3000/api/brain/embed-existing \
 *        -H "Authorization: Bearer <CRON_SECRET>"
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { embed } from "@/lib/brain/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel / Edge: give this plenty of time for large backlogs.
export const maxDuration = 300;

const BATCH_SIZE = 20;      // rows per batch
const BATCH_DELAY_MS = 1200; // ~50 req/min -- safe under 60 req/min Gemini free limit

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  // Auth
  const secret = process.env.CRON_SECRET;
  const auth   = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Find all memories without an embedding.
  const total = await db.brainMemory.count({
    where: { embedding: null, status: { not: "ARCHIVED" } },
  });

  if (total === 0) {
    return NextResponse.json({ ok: true, message: "All memories already have embeddings.", updated: 0 });
  }

  let offset = 0;
  let updated = 0;
  let failed  = 0;

  while (offset < total) {
    const batch = await db.brainMemory.findMany({
      where: { embedding: null, status: { not: "ARCHIVED" } },
      select: { id: true, content: true },
      take:   BATCH_SIZE,
      skip:   offset,
    });

    if (batch.length === 0) break;

    for (const row of batch) {
      const vec = await embed(row.content);
      if (vec) {
        await db.brainMemory.update({
          where: { id: row.id },
          data:  { embedding: JSON.stringify(vec) },
        });
        updated++;
      } else {
        failed++;
      }
    }

    offset += batch.length;

    // Pause between batches to respect rate limits.
    if (offset < total) await sleep(BATCH_DELAY_MS);
  }

  return NextResponse.json({
    ok: true,
    message: `Backfill complete. ${updated} embedded, ${failed} skipped (API unavailable).`,
    total,
    updated,
    failed,
  });
}
