import { z } from "zod";

/** Login: shape only — strength is enforced when a password is set (admin/users). */
export const loginSchema = z.object({
  email: z.string().trim().min(1).email(),
  password: z.string().min(1).max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
