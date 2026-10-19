import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { LiveClock } from "./live-clock";
import { Breadcrumb } from "./breadcrumb";
import { UserMenu } from "./user-menu";
import { NotificationsBell } from "./notifications-bell";
import { SoundToggle } from "./sound-toggle";
import { ThemeToggle } from "./theme-toggle";
import type { SessionUser } from "@/types";
import { NavMenuButton } from "./nav-drawer";

interface HeaderProps {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    role: SessionUser["role"];
    department: string | null;
  };
}

export function Header({ user }: HeaderProps) {
  return (
    <header className="material sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/70 px-4 lg:px-6">
      <NavMenuButton />
      <Breadcrumb />
      <div className="ms-auto flex items-center gap-1">
        <LiveClock />
        <div className="mx-2 hidden h-6 w-px bg-border sm:block" aria-hidden />
        <LanguageSwitcher />
        <ThemeToggle />
        <SoundToggle />
        <NotificationsBell />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
