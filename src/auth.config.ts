import type { NextAuthConfig } from "next-auth";
import { canAccessRoute } from "@/lib/rbac";
import type { Role } from "@/lib/constants";

/**
 * Edge-compatible auth config.
 * No Prisma or Node-only imports here — runs in Edge runtime.
 * Used by middleware.ts and the full auth setup in auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = (auth?.user?.role ?? null) as Role | null;
      const path = nextUrl.pathname;

      // Public paths — always allow
      const publicPaths = ["/", "/login", "/api/health"];
      if (publicPaths.includes(path)) {
        if (path === "/login" && isLoggedIn) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        return true;
      }

      // Protected: require login
      if (!isLoggedIn) {
        const loginUrl = new URL("/login", nextUrl);
        loginUrl.searchParams.set("from", path);
        return Response.redirect(loginUrl);
      }

      // RBAC check
      if (role && !canAccessRoute(role, path)) {
        return Response.redirect(new URL("/dashboard?denied=true", nextUrl));
      }

      return true;
    },
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