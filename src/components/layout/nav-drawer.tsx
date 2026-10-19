"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useT } from "@/lib/i18n/client";

/** Small-screen navigation: the sidebar becomes a drawer opened from the header. */
const Ctx = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => {} });

export function NavDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}

export function useNavDrawer() {
  return useContext(Ctx);
}

export function NavMenuButton() {
  const { setOpen } = useNavDrawer();
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={t("layout.menu")}
      className="-ms-2 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
