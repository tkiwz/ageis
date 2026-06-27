/**
 * POST /api/knowledge/upload
 * Multipart form upload — accepts a file + optional context.
 *
 * Field names:
 *   - file: the document
 *   - contextType (optional): incident / permit / pipeline / site
 *   - contextId (optional)
 */
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, unauthorized } from "@/lib/api-response";
import { ingestContribution } from "@/lib/knowledge/ingest";
import { extractDocumentText } from "@/lib/knowledge/document-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return fail("INVALID_BODY", "Expected multipart/form-data", 400);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) return fail("MISSING_FILE", "file field required", 400);
  if (file.size === 0) return fail("EMPTY_FILE", "Uploaded file is empty", 400);
  if (file.size > MAX_FILE_BYTES) return fail("FILE_TOO_LARGE", "File exceeds 10 MB", 400);

  const contextType = formData.get("contextType")?.toString();
  const contextId = formData.get("contextId")?.toString();

  const buffer = Buffer.from(await file.arrayBuffer());
  const extraction = await extractDocumentText(file.name, buffer);

  if (!extraction.ok || !extraction.text || extraction.text.trim().length < 30) {
    return fail(
      "EXTRACTION_FAILED",
      extraction.warnings.join(" ") || "Could not extract enough text to learn from.",
      422,
    );
  }

  // Hand the extracted text to the regular ingest pipeline
  const result = await ingestContribution({
    source: "DOCUMENT",
    rawContent: extraction.text.slice(0, 8000),
    contributorId: session.user.id!,
    contextType,
    contextId,
    fileName: file.name,
    fileSize: file.size,
  });

  return ok({
    ...result,
    extraction: {
      bytes: file.size,
      truncated: extraction.truncated,
      warnings: extraction.warnings,
    },
  });
}
