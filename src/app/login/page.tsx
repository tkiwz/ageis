import { Suspense } from "react";
import { Shield } from "lucide-react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.signIn"), description: t("app.description") };
}

export default async function LoginPage() {
  const t = await getT();
  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute end-4 top-4">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Shield className="mb-4 h-14 w-14 text-primary" strokeWidth={1.5} />
          <h1 className="font-display text-4xl font-semibold tracking-tight">{t("app.name")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("app.tagline")}</p>
        </div>

        <Suspense fallback={<div className="text-center text-sm text-muted-foreground">{t("common.loading")}</div>}>
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center text-xs text-muted-foreground/70">{t("auth.footer")}</p>
      </div>
    </div>
  );
}
