import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Logo3DLazy } from "@/components/brand/logo-3d-lazy";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.signIn"), description: t("app.description") };
}

export default async function LoginPage() {
  const t = await getT();
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="absolute end-4 top-4 flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[380px] animate-fade-in">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo3DLazy className="h-44 w-44" />
          <h1 className="mt-2 text-3xl font-semibold tracking-tight" dir="ltr">AEGIS</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t("app.tagline")}</p>
        </div>

        <Suspense fallback={<div className="h-64 rounded-xl bg-muted" />}>
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center text-xs text-muted-foreground">{t("auth.footer")}</p>
      </div>
    </div>
  );
}
