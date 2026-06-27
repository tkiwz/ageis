import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, unauthorized } from "@/lib/api-response";
import { reviewPermit } from "@/lib/permits/smart-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  const { id } = await params;
  const result = await reviewPermit(id);
  return ok(result);
}
