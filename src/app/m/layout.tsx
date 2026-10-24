import type { Metadata, Viewport } from "next";
import { requireAuth } from "@/lib/auth-helpers";
import { MobileShell } from "./mobile-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: { absolute: "AEGIS" }, manifest: "/manifest.webmanifest" };

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Field app for workers: big targets, Arabic first, works offline. */
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  return <MobileShell userName={user.name ?? null}>{children}</MobileShell>;
}
