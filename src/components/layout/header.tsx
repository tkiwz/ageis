import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { LiveClock } from "./live-clock";
import { Breadcrumb } from "./breadcrumb";
import { UserMenu } from "./user-menu";
import { NotificationsBell } from "./notifications-bell";
import { SoundToggle } from "./sound-toggle";
import type { SessionUser } from "@/types";

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
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-6 backdrop-blur-md">
      <Breadcrumb />
      <div className="ml-auto flex items-center gap-4">
        <LanguageSwitcher />
        <LiveClock />
        <SoundToggle />
        <NotificationsBell />
        <UserMenu user={user} />
      </div>
    </header>
  );
}