"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle, Loader2, LogIn, UserPlus, ShieldCheck,
} from "lucide-react";
import { loginSchema, registerSchema } from "@/lib/validations/auth";

type Mode = "login" | "register";

// ─── PIN Input: single hidden input + 6 visual boxes ─────────
// Most reliable approach: one real input captures all typing,
// 6 divs show the result. No focus-juggling between inputs.
function PinInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const hiddenRef = useRef<HTMLInputElement>(null);

  function focus() {
    hiddenRef.current?.focus();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
    onChange(digits);
  }

  // Block non-numeric keys
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (
      !/^\d$/.test(e.key) &&
      !["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab"].includes(e.key) &&
      !e.metaKey && !e.ctrlKey
    ) {
      e.preventDefault();
    }
  }

  return (
    <div
      className="flex gap-2 justify-center cursor-text relative"
      onClick={focus}
    >
      {/* Hidden real input — captures typing */}
      <input
        ref={hiddenRef}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoComplete="off"
        aria-label="كلمة المرور"
        style={{
          position: "absolute",
          opacity: 0,
          width: "100%",
          height: "100%",
          top: 0,
          left: 0,
          cursor: "text",
          zIndex: 1,
        }}
      />

      {/* Visual boxes — display only */}
      {Array.from({ length: 6 }).map((_, i) => {
        const filled  = i < value.length;
        const isNext  = i === value.length;
        return (
          <div
            key={i}
            className={[
              "h-12 w-10 rounded-lg border flex items-center justify-center",
              "text-2xl select-none transition-all duration-150 relative z-0",
              disabled ? "opacity-40" : "",
              filled
                ? "border-primary bg-primary/10 text-primary"
                : isNext
                  ? "border-primary/70 bg-background ring-1 ring-primary/50"
                  : "border-border/50 bg-background/50",
            ].join(" ")}
          >
            {filled ? "•" : ""}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("from") ?? "/dashboard";

  const [mode, setMode] = useState<Mode>("login");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPin,   setLoginPin]   = useState("");

  const [regName,    setRegName]    = useState("");
  const [regEmail,   setRegEmail]   = useState("");
  const [regPin,     setRegPin]     = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setSuccess(null);
    setLoginPin("");
    setRegPin("");
    setRegConfirm("");
  }

  // ── Sign In ──────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email: loginEmail, password: loginPin });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
      return;
    }

    startTransition(async () => {
      const res = await signIn("credentials", {
        email:    parsed.data.email,
        password: parsed.data.password,
        redirect: false,
      });

      if (res?.error) {
        setError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
        setLoginPin("");
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    });
  }

  // ── Register ─────────────────────────────────────────────────
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const parsed = registerSchema.safeParse({
      name:            regName,
      email:           regEmail,
      password:        regPin,
      confirmPassword: regConfirm,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/auth/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:     parsed.data.name,
          email:    parsed.data.email,
          password: parsed.data.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error?.message ?? "فشل إنشاء الحساب");
        return;
      }

      setSuccess("تم إنشاء حساب المدير — يمكنك تسجيل الدخول الآن");
      setRegName(""); setRegEmail(""); setRegPin(""); setRegConfirm("");
      setTimeout(() => switchMode("login"), 1800);
    });
  }

  const pinMismatch = regConfirm.length === 6 && regConfirm !== regPin;

  return (
    <Card className="glass overflow-hidden">

      {/* ── Tabs ── */}
      <div className="flex border-b border-border/40">
        {(["login", "register"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={[
              "flex flex-1 items-center justify-center gap-2 py-3.5",
              "text-sm font-medium border-b-2 -mb-px transition-colors",
              mode === m
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {m === "login"
              ? <><LogIn className="h-4 w-4" /> تسجيل الدخول</>
              : <><UserPlus className="h-4 w-4" /> إنشاء حساب</>}
          </button>
        ))}
      </div>

      <CardContent className="space-y-5 pt-6">

        {/* Alerts */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="border-green-500/40 bg-green-500/10 text-green-400">
            <ShieldCheck className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* ── Login ── */}
        {mode === "login" && (
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="l-email">البريد الإلكتروني</Label>
              <Input
                id="l-email"
                type="email"
                placeholder="admin@aegis.local"
                autoComplete="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                disabled={isPending}
                dir="ltr"
              />
            </div>

            <div className="space-y-3">
              <Label className="block text-center text-sm">
                كلمة المرور — 6 خانات
              </Label>
              <PinInput
                value={loginPin}
                onChange={setLoginPin}
                disabled={isPending}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isPending || loginPin.length < 6 || !loginEmail}
            >
              {isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري الدخول...</>
                : <><LogIn className="h-4 w-4" /> دخول</>}
            </Button>
          </form>
        )}

        {/* ── Register ── */}
        {mode === "register" && (
          <form onSubmit={handleRegister} className="space-y-4">

            <div className="flex items-center justify-center gap-2 rounded-lg
              border border-primary/30 bg-primary/5 px-3 py-2">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs font-medium text-primary">
                ينشئ حساب مدير (ADMIN) فقط
              </span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="r-name">الاسم الكامل</Label>
              <Input
                id="r-name"
                type="text"
                placeholder="محمد العمري"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="r-email">البريد الإلكتروني</Label>
              <Input
                id="r-email"
                type="email"
                placeholder="admin@aegis.local"
                autoComplete="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                disabled={isPending}
                dir="ltr"
              />
            </div>

            <div className="space-y-3">
              <Label className="block text-center text-sm">كلمة المرور — 6 خانات</Label>
              <PinInput value={regPin} onChange={setRegPin} disabled={isPending} />
            </div>

            <div className="space-y-3">
              <Label className="block text-center text-sm">تأكيد كلمة المرور</Label>
              <PinInput value={regConfirm} onChange={setRegConfirm} disabled={isPending} />
              {pinMismatch && (
                <p className="text-center text-xs text-destructive">
                  كلمتا المرور غير متطابقتين
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={
                isPending ||
                regPin.length < 6 ||
                regConfirm.length < 6 ||
                pinMismatch ||
                !regName.trim() ||
                !regEmail.trim()
              }
            >
              {isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري الإنشاء...</>
                : <><UserPlus className="h-4 w-4" /> إنشاء حساب المدير</>}
            </Button>
          </form>
        )}

      </CardContent>
    </Card>
  );
}
