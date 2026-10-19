/**
 * Zod schemas for API write bodies. Reject bad input with 400
 * instead of letting Prisma throw a 500.
 */
import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).optional().nullable();
const optStr = (max: number) => z.string().trim().max(max).optional();

export const pipelineCreateSchema = z.object({
  code: text(40),
  name: text(200),
  nameAr: optText(200),
  length: z.coerce.number().positive(),
  diameter: z.coerce.number().positive(),
  material: text(40),
  status: z.enum(["OPERATIONAL", "MAINTENANCE", "INSPECTION", "SHUTDOWN"]).default("OPERATIONAL"),
  productType: text(40),
  pressureMin: z.coerce.number(),
  pressureMax: z.coerce.number(),
  flowRate: z.coerce.number().optional().nullable(),
  startSiteId: optText(40),
  endSiteId: optText(40),
  startLat: z.coerce.number().min(-90).max(90),
  startLng: z.coerce.number().min(-180).max(180),
  endLat: z.coerce.number().min(-90).max(90),
  endLng: z.coerce.number().min(-180).max(180),
  midPoints: optText(20_000),
  installedAt: z.coerce.date(),
  notes: optText(5_000),
});

export const pipelineUpdateSchema = z.object({
  name: text(200).optional(),
  nameAr: optText(200),
  status: z.enum(["OPERATIONAL", "MAINTENANCE", "INSPECTION", "SHUTDOWN"]).optional(),
  notes: optText(5_000),
  lastInspection: z.coerce.date().optional().nullable(),
});

export const alertCreateSchema = z.object({
  type: z.enum(["INFO", "WARNING", "CRITICAL", "EMERGENCY"]),
  title: text(200),
  message: text(2_000),
  channels: optStr(200),
  status: optStr(40),
  isAutonomous: z.boolean().optional(),
  siteId: optStr(40),
});

export const whatsappSchema = z.object({
  message: text(1_000),
});

/** First issue as a readable message. */
export function zodMessage(err: z.ZodError): string {
  const i = err.issues[0];
  return i ? `${i.path.join(".") || "body"}: ${i.message}` : "Invalid input";
}
