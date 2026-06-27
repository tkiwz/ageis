/**
 * Voice Actions — P0-hardened with Zod whitelist + 2-turn confirmation.
 *
 * Security model:
 *   - Each action declares a Zod schema. The voice parser's proposed params
 *     are validated/coerced before execution; unknown fields rejected.
 *   - Sensitive actions (lockdownSite) NEVER execute from a single transcript.
 *     The first turn returns an HMAC-signed confirmation token; the client
 *     must echo it back on a SECOND turn for the action to fire.
 *   - All actions are kill-switch gated + RBAC checked + audit logged.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { checkAutonomyAllowed } from "@/lib/autonomy/settings";
import { issueConfirmationToken, verifyConfirmationToken } from "./confirmation-token";
import type { Role } from "@/lib/constants";

export interface VoiceActionContext {
  userId: string;
  role: Role;
  email?: string;
  /** Token from a previous turn — required for sensitive actions. */
  confirmationToken?: string;
}

export interface VoiceActionResult {
  success: boolean;
  message: string;
  messageAr?: string;
  /** When set, client must re-call with this token to confirm. */
  confirmationToken?: string;
  confirmationPrompt?: { en: string; ar: string };
  blocked?: string;
  data?: Record<string, unknown>;
}

interface ActionDef<T extends z.ZodTypeAny> {
  name: string;
  description: string;
  rolesAllowed: Role[];
  requiresConfirmation: boolean;
  schema: T;
  execute: (params: z.infer<T>, ctx: VoiceActionContext) => Promise<VoiceActionResult>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Record<string, ActionDef<any>> = {};

function register<T extends z.ZodTypeAny>(def: ActionDef<T>) {
  REGISTRY[def.name] = def;
}

// ─── Action schemas ────────────────────────────────────────────────────────

const incidentSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional().default(""),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  location: z.string().max(200).optional(),
  siteCode: z.string().max(50).optional(),
  type: z.enum(["FIRE", "GAS_LEAK", "INJURY", "PIPELINE_LEAK", "NEAR_MISS", "EQUIPMENT_FAILURE", "OTHER"]).default("OTHER"),
}).strict();

register({
  name: "createIncident",
  description: "Create a new incident report.",
  rolesAllowed: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR"],
  requiresConfirmation: false,
  schema: incidentSchema,
  async execute(params, ctx) {
    const site = params.siteCode
      ? await db.site.findUnique({ where: { code: params.siteCode } })
      : await db.site.findFirst();
    if (!site) return { success: false, message: "No site available — please specify a site code." };

    const count = await db.incident.count();
    const incidentNumber = `INC-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
    const incident = await db.incident.create({
      data: {
        incidentNumber,
        title: params.title,
        description: params.description,
        type: params.type,
        severity: params.severity,
        status: "REPORTED",
        location: params.location ?? site.name,
        occurredAt: new Date(),
        siteId: site.id,
        reporterId: ctx.userId,
      },
    });
    await db.auditLog.create({
      data: {
        module: "SAFETY", action: "VOICE_INCIDENT_CREATED",
        actionType: "AI_AUTONOMOUS", isAutonomous: true,
        description: `Voice created incident ${incidentNumber}`,
        metadata: JSON.stringify({ incidentId: incident.id, params }),
        riskLevel: incident.severity, siteId: site.id, userId: ctx.userId,
      },
    });
    return {
      success: true,
      message: `Incident ${incidentNumber} created at ${site.name}.`,
      messageAr: `تم إنشاء الحادثة ${incidentNumber} في ${site.nameAr ?? site.name}.`,
      data: { incidentId: incident.id, incidentNumber },
    };
  },
});

const assignTaskSchema = z.object({
  taskId: z.string().max(200),
  assigneeIdentifier: z.string().max(200),
}).strict();

register({
  name: "assignTask",
  description: "Assign an existing task to a user.",
  rolesAllowed: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR"],
  requiresConfirmation: false,
  schema: assignTaskSchema,
  async execute(params, ctx) {
    const ident = params.assigneeIdentifier;
    const assignee = await db.user.findFirst({
      where: {
        OR: [
          { id: ident },
          { email: ident.toLowerCase() },
          // No leading wildcards — exact-prefix or contains, length-bounded
          { name: { contains: ident.slice(0, 100) } },
        ],
      },
    });
    if (!assignee) return { success: false, message: `User not found: ${ident}` };

    const task = await db.task.findFirst({
      where: { OR: [{ id: params.taskId }, { title: { contains: params.taskId.slice(0, 200) } }] },
    });
    if (!task) return { success: false, message: `Task not found: ${params.taskId}` };

    await db.task.update({
      where: { id: task.id },
      data: { assigneeId: assignee.id, isAutoAssigned: true },
    });
    await db.auditLog.create({
      data: {
        module: "OPERATIONS", action: "VOICE_TASK_ASSIGNED",
        actionType: "AI_AUTONOMOUS", isAutonomous: true,
        description: `Voice assigned "${task.title}" to ${assignee.name}`,
        metadata: JSON.stringify({ taskId: task.id, assigneeId: assignee.id }),
        userId: ctx.userId,
      },
    });
    return {
      success: true,
      message: `Task "${task.title}" assigned to ${assignee.name}.`,
      messageAr: `تم إسناد المهمة إلى ${assignee.name}.`,
      data: { taskId: task.id, assigneeId: assignee.id },
    };
  },
});

register({
  name: "markIAmSafe",
  description: 'Worker reports "I am safe".',
  rolesAllowed: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR", "CONTRACTOR"],
  requiresConfirmation: false,
  schema: z.object({}).strict(),
  async execute(_params, ctx) {
    await db.auditLog.create({
      data: {
        module: "SAFETY", action: "WORKER_SAFE_CHECKIN",
        actionType: "MANUAL", isAutonomous: false,
        description: `Worker safe via voice: ${ctx.email ?? ctx.userId}`,
        userId: ctx.userId,
      },
    });
    return {
      success: true,
      message: "Your safety check-in is recorded. Stay safe.",
      messageAr: "تم تسجيل أنك بأمان. حافظ على سلامتك.",
    };
  },
});

const lockdownSchema = z.object({
  siteCode: z.string().min(2).max(50),
  reason: z.string().min(3).max(500),
}).strict();

register({
  name: "lockdownSite",
  description: "Lock down a site — STOPS all work. SENSITIVE.",
  rolesAllowed: ["ADMIN", "HSSE_MANAGER"],
  requiresConfirmation: true,
  schema: lockdownSchema,
  async execute(params, ctx) {
    // Sensitive: must present a token from a previous turn.
    if (!ctx.confirmationToken) {
      const token = issueConfirmationToken(ctx.userId, "lockdownSite", params);
      return {
        success: false,
        confirmationToken: token,
        message: `Confirm lockdown of ${params.siteCode}? Say "confirm lockdown" to proceed.`,
        confirmationPrompt: {
          en: `Confirm lockdown of ${params.siteCode}? Say "confirm lockdown" to proceed.`,
          ar: `هل تؤكد إغلاق الموقع ${params.siteCode}؟ قل "تأكيد الإغلاق" للمتابعة.`,
        },
      };
    }
    const verification = verifyConfirmationToken(ctx.confirmationToken, ctx.userId, "lockdownSite", params);
    if (!verification.valid) {
      return { success: false, message: `Confirmation rejected: ${verification.reason}` };
    }
    const site = await db.site.findUnique({ where: { code: params.siteCode } });
    if (!site) return { success: false, message: `Site ${params.siteCode} not found` };

    await db.site.update({
      where: { id: site.id },
      data: { isLockedDown: true, status: "LOCKED_DOWN" },
    });
    await db.auditLog.create({
      data: {
        module: "COMMAND", action: "SITE_LOCKED_DOWN",
        actionType: "AI_AUTONOMOUS", isAutonomous: true,
        description: `Voice locked down ${site.code}: ${params.reason}`,
        metadata: JSON.stringify({ siteId: site.id, reason: params.reason }),
        riskLevel: "CRITICAL", siteId: site.id, userId: ctx.userId,
      },
    });
    return {
      success: true,
      message: `Site ${site.code} is now LOCKED DOWN.`,
      messageAr: `الموقع ${site.code} الآن في وضع الإغلاق.`,
      data: { siteId: site.id },
    };
  },
});

const droneSchema = z.object({
  location: z.string().min(2).max(200),
  purpose: z.string().min(2).max(200),
}).strict();

register({
  name: "dispatchDrone",
  description: "Dispatch a drone for visual inspection.",
  rolesAllowed: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"],
  requiresConfirmation: false,
  schema: droneSchema,
  async execute(params, ctx) {
    await db.alert.create({
      data: {
        title: `Drone dispatch requested`,
        type: "DRONE_DISPATCH",
        message: `Drone dispatch to ${params.location} — ${params.purpose}`,
        channels: JSON.stringify(["in-app"]),
        status: "PENDING",
        isAutonomous: true,
      },
    });
    await db.auditLog.create({
      data: {
        module: "COMMAND", action: "VOICE_DRONE_DISPATCHED",
        actionType: "AI_AUTONOMOUS", isAutonomous: true,
        description: `Drone dispatch to ${params.location}`,
        metadata: JSON.stringify(params), userId: ctx.userId,
      },
    });
    return {
      success: true,
      message: `Drone dispatch requested to ${params.location}.`,
      messageAr: `تم طلب إرسال طائرة مسيّرة إلى ${params.location}.`,
    };
  },
});

const observationSchema = z.object({
  type: z.enum(["UNSAFE_CONDITION", "UNSAFE_ACT", "NEAR_MISS"]).default("UNSAFE_CONDITION"),
  location: z.string().min(2).max(200),
  findings: z.string().min(3).max(2000),
}).strict();

register({
  name: "createObservation",
  description: "Create a safety observation.",
  rolesAllowed: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR"],
  requiresConfirmation: false,
  schema: observationSchema,
  async execute(params, ctx) {
    const site = await db.site.findFirst();
    if (!site) return { success: false, message: "No site available" };
    const count = await db.observation.count();
    const obs = await db.observation.create({
      data: {
        recordNumber: `OBS-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
        type: params.type, status: "OPEN",
        location: params.location, findings: params.findings,
        siteId: site.id, reportedById: ctx.userId,
      },
    });
    await db.auditLog.create({
      data: {
        module: "SAFETY", action: "VOICE_OBSERVATION_CREATED",
        actionType: "AI_AUTONOMOUS", isAutonomous: true,
        description: `Voice created observation ${obs.recordNumber}`,
        metadata: JSON.stringify({ observationId: obs.id }),
        siteId: site.id, userId: ctx.userId,
      },
    });
    return {
      success: true,
      message: `Observation ${obs.recordNumber} recorded.`,
      messageAr: `تم تسجيل الملاحظة ${obs.recordNumber}.`,
      data: { observationId: obs.id },
    };
  },
});

// ─── Registry helpers ───

export function listAvailableActionsForRole(role: Role): {
  name: string;
  description: string;
  schemaShape: string;
  requiresConfirmation: boolean;
}[] {
  return Object.values(REGISTRY)
    .filter((a) => a.rolesAllowed.includes(role))
    .map((a) => {
      // Render Zod shape as a human-readable hint for the LLM
      const shape = (a.schema as z.ZodObject<z.ZodRawShape>).shape ?? {};
      const hint = Object.keys(shape).map((k) => k).join(", ") || "(no params)";
      return {
        name: a.name,
        description: a.description,
        schemaShape: hint,
        requiresConfirmation: a.requiresConfirmation,
      };
    });
}

export async function executeVoiceAction(
  name: string,
  rawParams: unknown,
  ctx: VoiceActionContext,
): Promise<VoiceActionResult> {
  const gate = await checkAutonomyAllowed("voice");
  if (!gate.allowed) {
    return { success: false, message: `Voice actions disabled: ${gate.reason}`, blocked: gate.reason };
  }
  const def = REGISTRY[name];
  if (!def) return { success: false, message: `Unknown action: ${name}` };
  if (!def.rolesAllowed.includes(ctx.role)) {
    return { success: false, message: `Your role (${ctx.role}) cannot perform ${name}.` };
  }

  // Strict Zod validation — unknown fields rejected (.strict())
  const parsed = def.schema.safeParse(rawParams);
  if (!parsed.success) {
    return {
      success: false,
      message: `Invalid parameters: ${parsed.error.errors.map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`).join("; ")}`,
    };
  }

  return def.execute(parsed.data, ctx);
}
