import type { NextAuthConfig } from "next-auth";

/**
 * Edge-compatible auth config.
 * No Prisma or Node-only imports here — runs in Edge runtime.
 * Used by middleware.ts and the full auth setup in auth.ts.
 * Page RBAC lives in middleware.ts (canAccessRoute).
 */
export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? (token.id as string | undefined) ?? "";
        token.role = user.role;
        token.department = user.department ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.department = token.department;
      }
      return session;
    },
  },
  providers: [], // Providers added in auth.ts (Node runtime)
} satisfies NextAuthConfig;