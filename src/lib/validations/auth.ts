import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "البريد الإلكتروني مطلوب")
    .email("بريد إلكتروني غير صالح"),
  password: z
    .string()
    .length(6, "كلمة المرور يجب أن تكون 6 خانات بالضبط")
    .regex(/^\d{6}$/, "كلمة المرور يجب أن تكون أرقاماً فقط"),
});

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, "الاسم يجب أن يكون حرفين على الأقل")
    .max(60, "الاسم طويل جداً"),
  email: z
    .string()
    .min(1, "البريد الإلكتروني مطلوب")
    .email("بريد إلكتروني غير صالح"),
  password: z
    .string()
    .length(6, "كلمة المرور يجب أن تكون 6 خانات بالضبط")
    .regex(/^\d{6}$/, "كلمة المرور يجب أن تكون أرقاماً فقط"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "كلمتا المرور غير متطابقتين",
  path: ["confirmPassword"],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
