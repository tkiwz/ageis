import { requireAuth } from "@/lib/auth-helpers";
import Link from "next/link";
import { Shield, AlertTriangle, ClipboardCheck, type LucideIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/m" className="flex items-center gap-2 font-display text-lg">
            <Shield className="h-5 w-5 text-primary" />
            AEGIS
          </Link>
          <Link href="/m/profile" className="text-xs text-muted-foreground">
            {user.name?.split(" ")[0] ?? "Worker"}
          </Link>
        </div>
      </header>

      <main className="px-4 py-4">{children}</main>

      {/* Fixed bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t border-border/40 bg-background/95 backdrop-blur">
        <BottomTab href="/m" icon={Shield} label="Home" />
        <BottomTab href="/m/safe" icon={Shield} label="I am safe" />
        <BottomTab href="/m/report" icon={AlertTriangle} label="Report" />
        <BottomTab href="/m/permits" icon={ClipboardCheck} label="Permits" />
      </nav>
    </div>
  );
}

function BottomTab({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 py-3 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}
