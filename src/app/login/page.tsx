import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { Shield } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to AEGIS HSSE Command Platform",
};

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-grid p-4">
      {/* Scanline */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent animate-[scan_8s_linear_infinite]" />

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="relative mb-4">
            <div className="absolute inset-0 blur-2xl bg-primary/30 rounded-full" />
            <Shield className="relative h-14 w-14 text-primary" strokeWidth={1.5} />
          </div>
          <h1 className="font-display text-4xl tracking-tight">AEGIS</h1>
          <p className="mt-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            HSSE Command Platform
          </p>
        </div>

        <Suspense fallback={<div className="text-center text-sm text-muted-foreground">Loading…</div>}>
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          AEGIS · Internal Prototype
        </p>
      </div>
    </div>
  );
}