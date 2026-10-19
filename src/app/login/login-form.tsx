"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { loginSchema } from "@/lib/validations/auth";
import { useT } from "@/lib/i18n/client";

export function LoginForm() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from");
  // Only same-site relative paths (no open redirect)
  const callbackUrl = from && from.startsWith("/") && !from.startsWith("//") ? from : "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(t("auth.invalidInput"));
      return;
    }

    startTransition(async () => {
      const res = await signIn("credentials", { ...parsed.data, redirect: false });
      if (res?.error) {
        setError(res.code === "credentials" || res.error === "CredentialsSignin" ? t("auth.invalidCredentials") : t("auth.lockedOut"));
        setPassword("");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <h2 className="text-center text-lg font-semibold">{t("auth.title")}</h2>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              autoComplete="username"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                dir="ltr"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isPending}
                className="pe-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 end-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                aria-label={t("auth.password")}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full gap-2" disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {isPending ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
